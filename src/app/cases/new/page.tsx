import { db } from "@/lib/supabase";
import { fmt, fmtDate } from "@/lib/money";
import { Card, ErrorBox } from "@/components/ui";
import ComplaintForm from "@/components/ComplaintForm";
import type { Row } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewCase({ searchParams }: { searchParams: Promise<{ txn?: string }> }) {
  const { txn } = await searchParams;
  const res = await db().from("transactions").select("*").in("paypal_status", ["COMPLETED", "PARTIALLY_REFUNDED"]).order("captured_at", { ascending: false });
  if (res.error) return <ErrorBox message={res.error.message} />;
  const rows: Row[] = res.data ?? [];
  const options = rows.map((x: Row) => ({ id: x.id as string, label: `${fmt(x.amount, x.currency)} · ${x.description} · ${x.payer_email ?? "payer unknown"} · ${fmtDate(x.captured_at)}` }));
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Submit a customer complaint</h1>
      <Card subtitle="Everything entered here is customer-provided and unverified until the backend checks it against PayPal.">
        {options.length === 0 ? <p className="text-sm text-slate-600">No captured payments yet. Create one on the Transactions page first.</p> : <ComplaintForm options={options} defaultId={txn} />}
      </Card>
    </div>
  );
}