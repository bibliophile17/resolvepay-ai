import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { storeEvidence, validateImage } from "@/lib/upload";

const LOCKED = ["refund_in_progress", "refund_pending", "refunded", "closed_no_refund"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const cRes = await db().from("cases").select("id,status,transaction_id").eq("id", id).maybeSingle();
    if (!cRes.data) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    if (LOCKED.includes(cRes.data.status)) return NextResponse.json({ error: "This case is closed to new evidence." }, { status: 409 });
    const photo = (await req.formData()).get("photo");
    if (!(photo instanceof File) || photo.size === 0) return NextResponse.json({ error: "Choose a photo first." }, { status: 400 });
    const err = validateImage(photo);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await storeEvidence(id, cRes.data.transaction_id, photo);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}