"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ComplaintForm({ options, defaultId }: { options: { id: string; label: string }[]; defaultId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/cases", { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) router.push(`/cases/${data.id}`);
    else {
      setError(data.error ?? "Could not submit the complaint.");
      setBusy(false);
    }
  }

  const field = "mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-medium">Transaction
        <select name="transaction_id" defaultValue={defaultId ?? ""} required className={field}>
          <option value="" disabled>Select a captured payment…</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Customer email
        <input name="customer_email" type="email" required className={field} placeholder="customer@example.com" />
      </label>
      <label className="block text-sm font-medium">Amount requested back (USD, optional)
        <input name="requested_amount" inputMode="decimal" className={field} placeholder="Leave blank for the full amount" />
      </label>
      <label className="block text-sm font-medium">What happened?
        <textarea name="complaint_text" required minLength={10} rows={5} className={field} placeholder="e.g. The mug arrived cracked in two pieces. / I was charged twice for the same order." />
      </label>
      <label className="block text-sm font-medium">Photo evidence (optional, JPEG/PNG/WebP, max 4 MB)
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className={field} />
      </label>
      <button disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit complaint"}</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}