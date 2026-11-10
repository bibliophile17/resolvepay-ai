import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { logEvent } from "@/lib/audit";
import { storeEvidence, validateImage } from "@/lib/upload";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const transactionId = String(form.get("transaction_id") ?? "");
    const email = String(form.get("customer_email") ?? "").trim();
    const text = String(form.get("complaint_text") ?? "").trim();
    const reqAmountRaw = String(form.get("requested_amount") ?? "").trim();
    const photo = form.get("photo");

    if (!transactionId || !/^\S+@\S+\.\S+$/.test(email) || text.length < 10 || text.length > 2000)
      return NextResponse.json({ error: "Select a transaction, enter a valid email and describe the issue (10–2000 characters)." }, { status: 400 });
    let requestedAmount: number | null = null;
    if (reqAmountRaw) {
      requestedAmount = Number(reqAmountRaw);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return NextResponse.json({ error: "Requested amount must be positive." }, { status: 400 });
    }
    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto) {
      const err = validateImage(photo as File);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const d = db();
    const tRes = await d.from("transactions").select("id,paypal_status").eq("id", transactionId).maybeSingle();
    if (!tRes.data || !["COMPLETED", "PARTIALLY_REFUNDED"].includes(tRes.data.paypal_status))
      return NextResponse.json({ error: "Complaints can only be linked to a captured payment." }, { status: 400 });

    const ins = await d.from("cases")
      .insert({ transaction_id: transactionId, customer_email: email, complaint_text: text, requested_amount: requestedAmount })
      .select("id").single();
    if (ins.error) throw new Error(ins.error.message);

    await logEvent({
      caseId: ins.data.id, transactionId, type: "complaint_submitted", actor: "customer",
      summary: "Customer complaint submitted and linked to the transaction.", data: { customer_email: email, requested_amount: requestedAmount },
    });
    if (hasPhoto) await storeEvidence(ins.data.id, transactionId, photo as File);
    return NextResponse.json({ id: ins.data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}