import { db } from "./supabase";

type Actor = "system" | "customer" | "ai" | "merchant" | "paypal";

// Throws on failure on purpose: if the audit trail cannot be written, we do not proceed with money movement.
export async function logEvent(e: {
  caseId?: string | null;
  transactionId?: string | null;
  type: string;
  actor: Actor;
  summary: string;
  data?: unknown;
}) {
  const { error } = await db().from("audit_events").insert({
    case_id: e.caseId ?? null,
    transaction_id: e.transactionId ?? null,
    event_type: e.type,
    actor: e.actor,
    summary: e.summary,
    data: e.data ?? null,
  });
  if (error) throw new Error("Audit log write failed: " + error.message);
}