import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { loadCaseContext } from "@/lib/context";
import { getCapture, refundCapture } from "@/lib/paypal";
import { logEvent } from "@/lib/audit";
import { fromCents, toCents } from "@/lib/money";
import { REFUND_RECS } from "@/lib/types";
import type { Row } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const now = () => new Date().toISOString();
  let locked = false;
  let refundRowId: string | null = null;
  const release = async () => {
    await d.from("cases").update({ status: "awaiting_decision", updated_at: now() }).eq("id", id);
    locked = false;
  };

  try {
    const body = await req.json();
    const action = String(body.action ?? "");
    const ctx = await loadCaseContext(id);
    if (!ctx) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    const { c, txn } = ctx;
    const aRes = await d.from("analyses").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const analysis: Row | null = aRes.data;
    if (!analysis) return NextResponse.json({ error: "Run the evidence review first." }, { status: 409 });
    if (c.status !== "awaiting_decision") return NextResponse.json({ error: `Case is "${c.status}", not awaiting a decision.` }, { status: 409 });

    if (action === "reject") {
      await logEvent({ caseId: id, transactionId: txn.id, type: "merchant_rejected", actor: "merchant", summary: "Merchant rejected the recommendation and closed the case without a refund." });
      await d.from("cases").update({ status: "closed_no_refund", updated_at: now() }).eq("id", id);
      return NextResponse.json({ ok: true, status: "closed_no_refund" });
    }
    if (action === "acknowledge") {
      const next = analysis.final_rec === "request_more_info" ? "needs_info" : "manual_review";
      await logEvent({ caseId: id, transactionId: txn.id, type: "merchant_acknowledged", actor: "merchant", summary: `Merchant accepted the recommendation (${analysis.final_rec}).` });
      await d.from("cases").update({ status: next, updated_at: now() }).eq("id", id);
      return NextResponse.json({ ok: true, status: next });
    }
    if (action !== "approve") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    if (!REFUND_RECS.includes(analysis.final_rec) || analysis.final_amount == null)
      return NextResponse.json({ error: "The current recommendation is not a refund." }, { status: 409 });
    if (!txn.paypal_capture_id) return NextResponse.json({ error: "No PayPal capture on this transaction." }, { status: 409 });

    const recCents = toCents(analysis.final_amount);
    const reqCents = body.amount != null ? toCents(body.amount) : recCents;
    if (!(reqCents > 0) || reqCents > recCents)
      return NextResponse.json({ error: "Approved amount must be above 0 and not exceed the recommended amount." }, { status: 400 });

    // Atomic lock: only one request can move the case into refund_in_progress.
    const lock = await d.from("cases").update({ status: "refund_in_progress", updated_at: now() }).eq("id", id).eq("status", "awaiting_decision").select("id");
    if (!lock.data || lock.data.length === 0) return NextResponse.json({ error: "A decision is already being processed." }, { status: 409 });
    locked = true;

    await logEvent({
      caseId: id, transactionId: txn.id, type: "merchant_approved", actor: "merchant",
      summary: `Merchant approved a refund of ${txn.currency} ${fromCents(reqCents)}.`, data: { amount: fromCents(reqCents), note: String(body.note ?? "").slice(0, 300) },
    });

    // Backend re-validation against PayPal at execution time
    const cap = await getCapture(txn.paypal_capture_id);
    if (!cap.ok) {
      await logEvent({ caseId: id, transactionId: txn.id, type: "refund_blocked", actor: "system", summary: `Refund blocked: could not re-verify the capture (HTTP ${cap.status}).`, data: cap.json });
      await release();
      return NextResponse.json({ error: "Could not re-verify the payment with PayPal. No refund was sent." }, { status: 502 });
    }
    const capAmount = toCents(cap.json?.amount?.value ?? 0);
    const problems: string[] = [];
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(cap.json?.status)) problems.push(`capture status is ${cap.json?.status}`);
    if (cap.json?.amount?.currency_code !== txn.currency) problems.push("currency mismatch");
    if (capAmount !== toCents(txn.amount)) problems.push("amount differs from stored record");
    const fresh = await d.from("refunds").select("amount,status").eq("transaction_id", txn.id);
    const freshRows: Row[] = fresh.data ?? [];
    const refunded = freshRows.filter((r: Row) => r.status === "pending" || r.status === "completed").reduce((s: number, r: Row) => s + toCents(r.amount), 0);
    const remaining = capAmount - refunded;
    if (reqCents > remaining) problems.push(`amount exceeds remaining refundable balance (${fromCents(Math.max(0, remaining))})`);
    if (problems.length) {
      await logEvent({ caseId: id, transactionId: txn.id, type: "refund_blocked", actor: "system", summary: `Refund blocked by backend validation: ${problems.join("; ")}.` });
      await release();
      return NextResponse.json({ error: "Refund blocked: " + problems.join("; ") }, { status: 409 });
    }

    // Unique partial index guarantees at most one active refund per case; the row id doubles as the PayPal idempotency key.
    const ins = await d.from("refunds").insert({ case_id: id, transaction_id: txn.id, amount: fromCents(reqCents), currency: txn.currency, status: "pending" }).select("id").single();
    if (ins.error) {
      await logEvent({ caseId: id, transactionId: txn.id, type: "refund_blocked", actor: "system", summary: "Duplicate refund prevented by the database constraint." });
      await release();
      return NextResponse.json({ error: "A refund already exists for this case." }, { status: 409 });
    }
    refundRowId = ins.data.id as string;
    await logEvent({ caseId: id, transactionId: txn.id, type: "refund_requested", actor: "system", summary: `Refund request ${refundRowId} submitted to PayPal Sandbox for ${txn.currency} ${fromCents(reqCents)}.` });

    const res = await refundCapture(txn.paypal_capture_id, fromCents(reqCents), txn.currency, refundRowId, `Refund for case ${id.slice(0, 8)}`);
    const paypalStatus: string | null = res.json?.status ?? null;
    const rowStatus = res.ok ? (paypalStatus === "COMPLETED" ? "completed" : "pending") : "failed";
    await d.from("refunds").update({
      status: rowStatus, paypal_refund_id: res.json?.id ?? null, paypal_status: paypalStatus, response_json: res.json, http_status: res.status, updated_at: now(),
    }).eq("id", refundRowId);
    await logEvent({
      caseId: id, transactionId: txn.id, type: "refund_result", actor: "paypal",
      summary: res.ok ? `PayPal Sandbox responded HTTP ${res.status}: refund ${res.json?.id} status ${paypalStatus}.` : `PayPal Sandbox rejected the refund (HTTP ${res.status}): ${res.json?.message ?? "see response"}.`,
      data: res.json,
    });

    if (rowStatus === "completed") await d.from("cases").update({ status: "refunded", updated_at: now() }).eq("id", id);
    else if (rowStatus === "pending") await d.from("cases").update({ status: "refund_pending", updated_at: now() }).eq("id", id);
    else await release();

    return NextResponse.json({ ok: res.ok, http_status: res.status, paypal_status: paypalStatus, refund_id: res.json?.id ?? null, paypal_response: res.json }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    const msg = (e as Error).message;
    if (refundRowId) {
      // The refund may or may not have reached PayPal. Keep the case blocked so nobody retries blindly.
      await d.from("cases").update({ status: "refund_pending", updated_at: now() }).eq("id", id);
      return NextResponse.json({ error: `Refund outcome unknown (${msg}). Do not retry. Check the PayPal Sandbox dashboard.` }, { status: 500 });
    }
    if (locked) await release();
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}