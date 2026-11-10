import { notFound } from "next/navigation";
import { db, EVIDENCE_BUCKET } from "@/lib/supabase";
import { loadCaseContext } from "@/lib/context";
import { remainingCents } from "@/lib/evidence";
import { POLICY } from "@/lib/policy";
import { fmt, fmtDate, fromCents } from "@/lib/money";
import { Badge, Card, SandboxBadge, statusTone, type Tone } from "@/components/ui";
import { AnalyzeButton, DecisionPanel, EvidenceUpload } from "@/components/CaseActions";
import type { EvidenceItem, EvidenceSource, Row } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<EvidenceSource, string> = { verified: "Verified", customer: "Customer-provided", merchant: "Merchant-provided", system: "System record" };
const SOURCE_TONE: Record<EvidenceSource, Tone> = { verified: "green", customer: "blue", merchant: "purple", system: "gray" };
const CLOSED = ["refund_in_progress", "refund_pending", "refunded", "closed_no_refund"];

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCaseContext(id);
  if (!ctx) notFound();
  const { c, txn, evidence, refunds, refundedCents } = ctx;
  const d = db();
  const aRes = await d.from("analyses").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const analysis: Row | null = aRes.data;
  const eRes = await d.from("audit_events").select("*").eq("case_id", id).order("id", { ascending: true });
  const events: Row[] = eRes.data ?? [];
  const photos = await Promise.all(
    evidence.map(async (e: Row) => {
      const s = await d.storage.from(EVIDENCE_BUCKET).createSignedUrl(e.storage_path, 3600);
      return { url: s.data?.signedUrl ?? "", name: e.original_name as string };
    }),
  );

  const items: EvidenceItem[] = analysis?.evidence_json ?? [];
  const ai: Row | null = analysis?.ai_json ?? null;
  const notes: string[] = analysis?.guardrail_notes ?? [];
  const remaining = remainingCents(txn.amount, refundedCents);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Case {id.slice(0, 8)}</h1>
        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
        <Badge>{c.complaint_type}</Badge>
      </div>

      <Card title="Customer complaint" subtitle="Customer-provided information. Not verified.">
        <p className="text-sm"><span className="text-slate-500">From:</span> {c.customer_email} · <span className="text-slate-500">Submitted:</span> {fmtDate(c.created_at)}</p>
        <p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{c.complaint_text}</p>
        <p className="mt-2 text-sm"><span className="text-slate-500">Amount requested:</span> {c.requested_amount ? fmt(c.requested_amount, txn.currency) : "not specified (full amount assumed)"}</p>
        {photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.url} alt={p.name} className="h-32 rounded border border-slate-200 object-cover" />
            ))}
          </div>
        )}
      </Card>

      <Card title="Linked transaction" subtitle="Payment data recorded from PayPal responses by the backend.">
        <div className="mb-2"><SandboxBadge /></div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Amount</dt><dd>{fmt(txn.amount, txn.currency)}</dd></div>
          <div><dt className="text-xs text-slate-500">PayPal status</dt><dd>{txn.paypal_status ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Last verified</dt><dd>{fmtDate(txn.verified_at)}</dd></div>
          <div><dt className="text-xs text-slate-500">Payer</dt><dd>{txn.payer_email ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Capture ID</dt><dd className="font-mono text-xs">{txn.paypal_capture_id ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Refundable balance</dt><dd>{fmt(fromCents(remaining), txn.currency)}</dd></div>
        </dl>
      </Card>

      <Card id="evidence" title="Evidence & AI review">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <AnalyzeButton caseId={id} rerun={!!analysis} />
          {!CLOSED.includes(c.status) && <EvidenceUpload caseId={id} />}
        </div>

        {!analysis ? (
          <p className="text-sm text-slate-500">No review yet. Running it verifies the payment with PayPal, evaluates the evidence rules and asks the AI for an interpretation.</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-3xl font-semibold">{analysis.score}%</p>
              <p className="text-xs text-slate-500">Evidence completeness. This is not a dispute win probability and not a measure of whether the customer is truthful.</p>
              <ul className="mt-2 divide-y divide-slate-100">
                {items.map((it) => (
                  <li key={it.key} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{it.label}</p>
                      <p className="text-xs text-slate-500">{it.detail}</p>
                    </div>
                    <Badge tone={it.met ? SOURCE_TONE[it.source] : "red"}>{it.met ? SOURCE_LABEL[it.source] : "Missing"}</Badge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-semibold text-purple-900">AI-generated interpretation (not verified fact)</p>
              {ai ? (
                <div className="mt-2 space-y-2 text-sm">
                  <p><b>Summary:</b> {ai.summary}</p>
                  <p><b>Claimed issue:</b> {ai.extracted?.claimed_issue ?? "—"} · <b>Item:</b> {ai.extracted?.item_description ?? "—"}</p>
                  {ai.photo_observation && <p><b>Photo observation:</b> {ai.photo_observation}</p>}
                  {(ai.missing_evidence as string[]).length > 0 && <p><b>Evidence the AI suggests collecting:</b> {(ai.missing_evidence as string[]).join("; ")}</p>}
                  <p><b>Policy comparison:</b> {ai.policy_comparison}</p>
                  <p><b>Reasoning:</b> {ai.reasoning}</p>
                  <p className="text-xs text-slate-500">Model: {analysis.ai_model} · confidence: {ai.confidence}</p>
                </div>
              ) : (
                <p className="mt-2 text-sm">AI unavailable ({analysis.ai_error}). The complaint type came from a keyword fallback and the recommendation from deterministic rules.</p>
              )}
            </div>

            <div className="rounded border border-slate-200 p-4">
              <p className="text-sm font-semibold">Merchant refund policy (merchant-provided)</p>
              <p className="mt-1 text-sm text-slate-700">{POLICY.text}</p>
            </div>

            <div className="rounded border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Recommended next action</p>
              <p className="mt-1 text-lg font-semibold">{analysis.final_rec}{analysis.final_amount ? ` · ${fmt(analysis.final_amount, txn.currency)}` : ""}</p>
              <p className="text-sm text-slate-700">Rule baseline: {analysis.baseline_rec}. {analysis.baseline_reason}</p>
              {ai && <p className="text-sm text-slate-700">AI suggested: {ai.recommendation}</p>}
              {notes.map((n, i) => <p key={i} className="mt-1 text-xs text-slate-600">Guardrail: {n}</p>)}
            </div>
          </div>
        )}
      </Card>

      <Card id="decision" title="Decision" subtitle="Only you can approve. The backend re-validates the payment, amount, currency and refundable balance before calling PayPal.">
        {c.status === "awaiting_decision" && analysis ? (
          <DecisionPanel caseId={id} finalRec={analysis.final_rec} finalAmount={analysis.final_amount} currency={txn.currency} />
        ) : (
          <p className="text-sm text-slate-600">
            {c.status === "needs_info" ? "More information was requested. Add evidence and re-run the review." : c.status === "manual_review" ? "Marked for manual review." : c.status === "submitted" ? "Run the review first." : `Case status: ${c.status}.`}
          </p>
        )}
        {refunds.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold">Refund records (actual PayPal Sandbox responses)</p>
            {refunds.map((r: Row) => (
              <div key={r.id} className="mt-2 rounded bg-slate-50 p-3 text-sm">
                <p>{fmt(r.amount, r.currency)} · our status: <Badge tone={r.status === "completed" ? "green" : r.status === "failed" ? "red" : "blue"}>{r.status}</Badge> · PayPal: {r.paypal_status ?? "—"} (HTTP {r.http_status ?? "—"})</p>
                <p className="font-mono text-xs">PayPal refund ID: {r.paypal_refund_id ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card id="audit" title="Audit timeline">
        <ol className="space-y-2">
          {events.map((e: Row) => (
            <li key={e.id} className="flex flex-wrap items-start gap-2 text-sm">
              <span className="w-44 shrink-0 text-xs text-slate-500">{fmtDate(e.created_at)}</span>
              <Badge>{e.actor}</Badge>
              <span className="flex-1">{e.summary}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}