import Link from "next/link";
import { db } from "@/lib/supabase";
import { fmt, fmtDate } from "@/lib/money";
import { Badge, Card, ErrorBox, statusTone } from "@/components/ui";
import type { Row } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const d = db();
  const [t, c, r, e] = await Promise.all([
    d.from("transactions").select("amount,paypal_status"),
    d.from("cases").select("id,status,complaint_type,customer_email,created_at").order("created_at", { ascending: false }),
    d.from("refunds").select("amount,status"),
    d.from("audit_events").select("*").order("id", { ascending: false }).limit(6),
  ]);
  const err = t.error ?? c.error ?? r.error ?? e.error;
  if (err) return <ErrorBox message={err.message} />;
  const txns: Row[] = t.data ?? [];
  const cases: Row[] = c.data ?? [];
  const refunds: Row[] = r.data ?? [];
  const events: Row[] = e.data ?? [];

  const captured = txns.filter((x: Row) => ["COMPLETED", "PARTIALLY_REFUNDED"].includes(x.paypal_status));
  const capturedTotal = captured.reduce((s: number, x: Row) => s + Number(x.amount), 0);
  const refundedTotal = refunds.filter((x: Row) => x.status === "completed").reduce((s: number, x: Row) => s + Number(x.amount), 0);
  const stats = [
    { label: "Captured payments (sandbox)", value: String(captured.length), sub: fmt(capturedTotal) },
    { label: "Open cases", value: String(cases.filter((x: Row) => !["refunded", "closed_no_refund"].includes(x.status)).length), sub: `${cases.length} total` },
    { label: "Awaiting your decision", value: String(cases.filter((x: Row) => x.status === "awaiting_decision").length), sub: "needs review" },
    { label: "Refunded via PayPal Sandbox", value: String(refunds.filter((x: Row) => x.status === "completed").length), sub: fmt(refundedTotal) },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold">Merchant dashboard</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">AI investigates. Evidence supports the decision. The merchant stays in control. PayPal executes.</p>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>
      <Card title="Recent cases">
        {cases.length === 0 ? <p className="text-sm text-slate-500">No cases yet. Create a sandbox payment, then submit a complaint.</p> : (
          <ul className="divide-y divide-slate-100">
            {cases.slice(0, 5).map((x: Row) => (
              <li key={x.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/cases/${x.id}`} className="text-blue-700 underline">{x.customer_email}</Link>
                <span className="flex gap-2"><Badge>{x.complaint_type}</Badge><Badge tone={statusTone(x.status)}>{x.status}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Latest audit events">
        {events.length === 0 ? <p className="text-sm text-slate-500">No events yet.</p> : (
          <ul className="space-y-1 text-sm">
            {events.map((x: Row) => <li key={x.id}><span className="text-slate-500">{fmtDate(x.created_at)}</span> · {x.summary}</li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}