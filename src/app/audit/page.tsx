import { db } from "@/lib/supabase";
import { fmtDate } from "@/lib/money";
import { Badge, Card, ErrorBox } from "@/components/ui";
import type { Row } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Audit() {
  const res = await db().from("audit_events").select("*").order("id", { ascending: false }).limit(100);
  if (res.error) return <ErrorBox message={res.error.message} />;
  const rows: Row[] = res.data ?? [];
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Audit history</h1>
      <Card subtitle="Append-only. The database rejects updates and deletes.">
        <ul className="divide-y divide-slate-100">
          {rows.length === 0 && <li className="py-3 text-sm text-slate-500">No events yet.</li>}
          {rows.map((x: Row) => (
            <li key={x.id} className="flex flex-wrap items-start gap-2 py-2 text-sm">
              <span className="w-44 shrink-0 text-xs text-slate-500">{fmtDate(x.created_at)}</span>
              <Badge>{x.actor}</Badge>
              <span className="flex-1">{x.summary}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}