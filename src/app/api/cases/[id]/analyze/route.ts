import { NextResponse } from "next/server";
import { db, EVIDENCE_BUCKET } from "@/lib/supabase";
import { loadCaseContext } from "@/lib/context";
import { getCapture } from "@/lib/paypal";
import { logEvent } from "@/lib/audit";
import { analyzeWithGemini, keywordType } from "@/lib/ai";
import { evaluateEvidence, remainingCents } from "@/lib/evidence";
import { baseline, finalize } from "@/lib/recommend";
import { POLICY } from "@/lib/policy";
import { fromCents, toCents } from "@/lib/money";
import type { ComplaintType, Row } from "@/lib/types";

const LOCKED = ["refund_in_progress", "refund_pending", "refunded", "closed_no_refund"];

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await loadCaseContext(id);
    if (!ctx) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    const { c, evidence, duplicates, isOriginal, refundedCents } = ctx;
    let txn: Row = ctx.txn;
    if (LOCKED.includes(c.status)) return NextResponse.json({ error: "This case can no longer be re-analysed." }, { status: 409 });
    const d = db();

    // 1) Backend verification against PayPal. Only this step can mark a payment as verified.
    let verification: Record<string, unknown> = { verified: false, reason: "No PayPal capture recorded for this transaction." };
    if (txn.paypal_capture_id) {
      const cap = await getCapture(txn.paypal_capture_id);
      if (cap.ok) {
        const same = toCents(cap.json?.amount?.value ?? 0) === toCents(txn.amount) && cap.json?.amount?.currency_code === txn.currency;
        const upd = { paypal_status: cap.json.status, verified_at: same ? new Date().toISOString() : null, raw_capture: cap.json };
        await d.from("transactions").update(upd).eq("id", txn.id);
        txn = { ...txn, ...upd };
        verification = { verified: same, paypal_status: cap.json.status, amount: cap.json.amount, ...(same ? {} : { reason: "Amount or currency differs from the stored record." }) };
      } else {
        verification = { verified: false, http_status: cap.status, reason: cap.json?.message ?? "PayPal lookup failed" };
      }
    }
    await logEvent({
      caseId: id, transactionId: txn.id, type: "transaction_verified", actor: "paypal",
      summary: verification.verified ? `PayPal confirmed capture ${txn.paypal_capture_id} as ${txn.paypal_status}.` : `Transaction could not be verified: ${String(verification.reason)}`,
      data: verification,
    });

    // 2) AI interpretation (optional input: first photo)
    let image: { mime: string; base64: string } | undefined;
    const first: Row | undefined = evidence.find((e: Row) => e.kind === "photo");
    if (first) {
      const dl = await d.storage.from(EVIDENCE_BUCKET).download(first.storage_path);
      if (dl.data && dl.data.size <= 3 * 1024 * 1024)
        image = { mime: first.mime_type, base64: Buffer.from(await dl.data.arrayBuffer()).toString("base64") };
    }
    const remaining = remainingCents(txn.amount, refundedCents);
    const facts = {
      transaction: { amount: txn.amount, currency: txn.currency, paypal_status: txn.paypal_status, captured_at: txn.captured_at, verified_by_backend: verification.verified === true },
      duplicate_payments_found_in_records: duplicates,
      already_refunded: fromCents(refundedCents),
      remaining_refundable: fromCents(remaining),
      photo_attached: !!image,
      customer_requested_amount: c.requested_amount,
    };
    const ai = await analyzeWithGemini({ facts, complaintText: c.complaint_text, policy: POLICY.text, image });
    const type: ComplaintType = ai.ok ? ai.data.complaint_type : keywordType(c.complaint_text);
    await logEvent({
      caseId: id, transactionId: txn.id, type: "ai_analysis", actor: "ai",
      summary: ai.ok ? `AI (${ai.model}) classified the complaint as ${type}; its output passed schema validation.` : `AI unavailable (${ai.error}); keyword fallback classified the complaint as ${type}.`,
    });

    // 3) Deterministic evidence rules, baseline, and guardrail
    const ev = evaluateEvidence({
      type, txn: txn as never, complaintText: c.complaint_text,
      requestedAmount: c.requested_amount != null ? Number(c.requested_amount) : null,
      photoCount: evidence.length, duplicateIds: duplicates.map((x) => x.id), refundedCents,
    });
    const base = baseline({ type, items: ev.items, remainingCents: remaining, isOriginalOfDuplicate: isOriginal });
    const fin = finalize(ai.ok ? ai.data.recommendation : null, ai.ok ? ai.data.recommended_amount : null, base);

    const ins = await d.from("analyses").insert({
      case_id: id, ai_source: ai.ok ? "gemini" : "fallback", ai_model: ai.model, ai_json: ai.ok ? ai.data : null,
      ai_error: ai.ok ? null : ai.error, evidence_json: ev.items, score: ev.score, baseline_rec: base.rec, baseline_reason: base.reason,
      final_rec: fin.final, final_amount: fin.amountCents != null ? fromCents(fin.amountCents) : null,
      guardrail_notes: fin.notes, verification_json: verification,
    });
    if (ins.error) throw new Error(ins.error.message);
    await d.from("cases").update({ complaint_type: type, status: "awaiting_decision", updated_at: new Date().toISOString() }).eq("id", id);

    const missing = ev.items.filter((x) => !x.met).map((x) => x.key);
    await logEvent({
      caseId: id, transactionId: txn.id, type: "evidence_evaluated", actor: "system",
      summary: `Evidence completeness ${ev.score}%. Missing: ${missing.length ? missing.join(", ") : "none"}.`, data: { score: ev.score, missing },
    });
    await logEvent({
      caseId: id, transactionId: txn.id, type: "recommendation_generated", actor: "system",
      summary: `Recommendation: ${fin.final}${fin.amountCents != null ? " of " + fromCents(fin.amountCents) : ""}. ${base.reason}`, data: { baseline: base.rec, notes: fin.notes },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
export const maxDuration = 60;

