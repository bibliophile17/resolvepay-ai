"use client";
import { useState, type FormEvent } from "react";

export default function NewPaymentForm() {
  const [amount, setAmount] = useState("10.00");
  const [description, setDescription] = useState("Sandbox demo order");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, description }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.approveUrl) window.location.href = data.approveUrl;
    else {
      setError(data.error ?? "Could not create the order.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Amount (USD)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1" />
      </label>
      <label className="text-sm">Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 block w-72 rounded border border-slate-300 px-2 py-1" />
      </label>
      <button disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Redirecting to PayPal…" : "Create sandbox payment"}
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}