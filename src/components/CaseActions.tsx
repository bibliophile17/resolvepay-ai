"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

async function send(url: string, body: BodyInit | null, json = false) {
  const res = await fetch(url, { method: "POST", headers: json ? { "Content-Type": "application/json" } : undefined, body });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function AnalyzeButton({ caseId, rerun }: { caseId: string; rerun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    const r = await send(`/api/cases/${caseId}/analyze`, null);
    if (!r.ok) setError(r.data.error ?? "Review failed.");
    setBusy(false);
    router.refresh();
  }
  return (
    <div>
      <button onClick={run} disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Verifying with PayPal and reviewing…" : rerun ? "Re-run evidence & AI review" : "Run evidence & AI review"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function EvidenceUpload({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await send(`/api/cases/${caseId}/evidence`, new FormData(e.currentTarget));
    setMsg(r.ok ? "Photo added. Re-run the review to include it." : r.data.error ?? "Upload failed.");
    setBusy(false);
    if (r.ok) router.refresh();
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="text-sm" />
      <button disabled={busy} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">{busy ? "Uploading…" : "Add customer photo"}</button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </form>
  );
}

export function DecisionPanel({ caseId, finalRec, finalAmount, currency }: { caseId: string; finalRec: string; finalAmount: string | null; currency: string }) {
  const router = useRouter();
  const isRefund = finalRec === "full_refund" || finalRec === "partial_refund";
  const [amount, setAmount] = useState(finalAmount ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "acknowledge") {
    if (action === "approve" && !window.confirm(`Submit a ${currency} ${amount} refund to PayPal Sandbox? This cannot be undone.`)) return;
    setBusy(true);
    setResult(null);
    const r = await send(`/api/cases/${caseId}/decision`, JSON.stringify({ action, amount: action === "approve" ? Number(amount) : undefined }), true);
    setResult(JSON.stringify(r.data.paypal_response ? { http_status: r.data.http_status, paypal_status: r.data.paypal_status, refund_id: r.data.refund_id } : r.data, null, 2));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {isRefund ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Refund amount ({currency}, can only be lowered)
            <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1" />
          </label>
          <button onClick={() => act("approve")} disabled={busy} className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Approve and refund via PayPal Sandbox</button>
        </div>
      ) : (
        <button onClick={() => act("acknowledge")} disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Accept recommendation</button>
      )}
      <button onClick={() => act("reject")} disabled={busy} className="ml-0 rounded border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50">Reject and close without refund</button>
      {result && <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">{result}</pre>}
    </div>
  );
}