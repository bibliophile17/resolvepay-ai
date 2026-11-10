import Link from "next/link";
import { db } from "@/lib/supabase";
import { fmt, fmtDate } from "@/lib/money";
import { Badge, Card, ErrorBox, SandboxBadge } from "@/components/ui";
import NewPaymentForm from "@/components/NewPaymentForm";
import type { Row } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Transactions() {
  const res = await db().from("transactions").select("*").order("created_at", { ascending: false });
  if (res.error) return <ErrorBox message={res.error.message} />;
  const rows: Row[] = res.data ?? [];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Transactions</h1>
      <Card title="Create a sandbox payment" subtitle="Opens PayPal Sandbox checkout. Log in with your US sandbox personal (buyer) account.">
        <NewPaymentForm />
      </Card>
      <Card title="Payment records">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr><th className="py-2">Created</th><th>Description</th><th>Amount</th><th>Payer</th><th>Capture ID</th><th>Status</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-slate-500">No payments yet.</td></tr>}
              {rows.map((x: Row) => {
                const paid = ["COMPLETED", "PARTIALLY_REFUNDED"].includes(x.paypal_status);
                return (
                  <tr key={x.id}>
                    <td className="py-2">{fmtDate(x.created_at)}</td>
                    <td>{x.description}</td>
                    <td>{fmt(x.amount, x.currency)}</td>
                    <td>{x.payer_email ?? "—"}</td>
                    <td className="font-mono text-xs">{x.paypal_capture_id ?? "—"}</td>
                    <td><Badge tone={paid ? "green" : "gray"}>{x.paypal_status ?? x.status}</Badge> <SandboxBadge /></td>
                    <td>{paid && <Link href={`/cases/new?txn=${x.id}`} className="text-blue-700 underline">Report issue</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}