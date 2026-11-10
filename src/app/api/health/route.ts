import { NextResponse } from "next/server";
import { db, EVIDENCE_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ENV = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_BASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"];
const TABLES = ["transactions", "cases", "evidence", "analyses", "refunds", "audit_events"];

export async function GET() {
  const env = Object.fromEntries(ENV.map((n) => [n, process.env[n] ? "set" : "MISSING"]));
  const out: Record<string, unknown> = { env };

  try {
    const tables: Record<string, string> = {};
    for (const t of TABLES) {
      const r = await db().from(t).select("*", { count: "exact", head: true });
      tables[t] = r.error ? "ERROR: " + r.error.message : "ok";
    }
    out.supabase_tables = tables;
    const b = await db().storage.getBucket(EVIDENCE_BUCKET);
    out.supabase_storage_bucket = b.error ? "ERROR: " + b.error.message : "ok (private: " + String(!b.data?.public) + ")";
  } catch (e) {
    out.supabase = "ERROR: " + (e as Error).message;
  }

  try {
    const base = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    out.paypal = { sandbox_url: base.includes("sandbox"), auth: res.ok ? "ok" : `FAILED (HTTP ${res.status})` };
  } catch (e) {
    out.paypal = "ERROR: " + (e as Error).message;
  }

  out.ai = process.env.GEMINI_API_KEY ? "key set (not tested, to save free quota)" : "no key: the app will use rules-only fallback";
  return NextResponse.json(out, { status: 200 });
}