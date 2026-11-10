import Link from "next/link";
import { db } from "@/lib/supabase";
import { fmtDate } from "@/lib/money";
import { Badge, Card, ErrorBox, statusTone } from "@/components/ui";
import type { Row } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Cases() {
  const res = await db().from("cases").select("*").order("created_at", { ascending: false });
  if (res.error) return <ErrorBox message={res.error.message} />;
  const rows: Row[] = res.data ?? [];
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Resolution cases</h1>
        <Link href="/cases/new" className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">New complaint</Link>
      </div>
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="py-2">Submitted</th><th>Customer</th><th>Type</th><th>Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-slate-500">No cases yet.</td></tr>}
            {rows.map((x: Row) => (
              <tr key={x.id}>
                <td className="py-2">{fmtDate(x.created_at)}</td>
                <td><Link href={`/cases/${x.id}`} className="text-blue-700 underline">{x.customer_email}</Link></td>
                <td><Badge>{x.complaint_type}</Badge></td>
                <td><Badge tone={statusTone(x.status)}>{x.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}