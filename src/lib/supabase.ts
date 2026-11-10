import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

export const EVIDENCE_BUCKET = "evidence";
let client: SupabaseClient | null = null;

// Server-side only. Uses the service-role key, which must never reach the browser.
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return client;
}