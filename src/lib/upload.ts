import { db, EVIDENCE_BUCKET } from "./supabase";
import { logEvent } from "./audit";

export const ALLOWED_IMAGES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // stays under Vercel's ~4.5 MB request limit

export function validateImage(f: File): string | null {
  if (!ALLOWED_IMAGES.includes(f.type)) return "Photo must be a JPEG, PNG or WebP image.";
  if (f.size > MAX_IMAGE_BYTES) return "Photo must be 4 MB or smaller.";
  return null;
}

export async function storeEvidence(caseId: string, transactionId: string, f: File) {
  const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${caseId}/${Date.now()}-${safe}`;
  const buf = Buffer.from(await f.arrayBuffer());
  const up = await db().storage.from(EVIDENCE_BUCKET).upload(path, buf, { contentType: f.type, upsert: false });
  if (up.error) throw new Error("Photo upload failed: " + up.error.message);
  const ins = await db().from("evidence").insert({
    case_id: caseId, kind: "photo", provided_by: "customer", storage_path: path, mime_type: f.type, original_name: f.name.slice(0, 120),
  });
  if (ins.error) throw new Error(ins.error.message);
  await logEvent({
    caseId, transactionId, type: "evidence_received", actor: "customer",
    summary: `Customer-provided photo received (${f.name}, ${Math.round(f.size / 1024)} KB).`,
  });
}