import { db } from "./supabase";
import { toCents } from "./money";
import type { Row } from "./types";

export async function loadCaseContext(caseId: string) {
  const d = db();
  const cRes = await d.from("cases").select("*").eq("id", caseId).maybeSingle();
  const c: Row | null = cRes.data;
  if (!c) return null;

  const tRes = await d.from("transactions").select("*").eq("id", c.transaction_id).single();
  const txn: Row = tRes.data;
  const eRes = await d.from("evidence").select("*").eq("case_id", caseId).order("created_at");
  const evidence: Row[] = eRes.data ?? [];
  const rRes = await d.from("refunds").select("*").eq("transaction_id", c.transaction_id).order("created_at");
  const refunds: Row[] = rRes.data ?? [];
  const refundedCents = refunds
    .filter((r: Row) => r.status === "pending" || r.status === "completed")
    .reduce((s: number, r: Row) => s + toCents(r.amount), 0);

  const duplicates: { id: string; captured_at: string | null }[] = [];
  if (txn.payer_email && txn.captured_at) {
    const oRes = await d
      .from("transactions")
      .select("id,captured_at")
      .in("paypal_status", ["COMPLETED", "PARTIALLY_REFUNDED"])
      .neq("id", txn.id)
      .eq("amount", txn.amount)
      .eq("currency", txn.currency)
      .eq("payer_email", txn.payer_email);
    const others: Row[] = oRes.data ?? [];
    for (const o of others) {
      if (o.captured_at && Math.abs(new Date(o.captured_at).getTime() - new Date(txn.captured_at).getTime()) <= 86_400_000)
        duplicates.push({ id: o.id, captured_at: o.captured_at });
    }
  }
  const isOriginal =
    duplicates.length > 0 && duplicates.every((x) => new Date(txn.captured_at).getTime() < new Date(x.captured_at as string).getTime());

  return { c, txn, evidence, refunds, refundedCents, duplicates, isOriginal };
}