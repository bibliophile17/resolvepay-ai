import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { captureOrder } from "@/lib/paypal";
import { logEvent } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    const d = db();
    const tRes = await d.from("transactions").select("*").eq("paypal_order_id", orderId).maybeSingle();
    const txn = tRes.data;
    if (!txn) return NextResponse.json({ error: "Unknown order" }, { status: 404 });
    if (txn.paypal_capture_id) return NextResponse.json({ transaction: txn, alreadyCaptured: true });

    const res = await captureOrder(orderId, `capture-${txn.id}`);
    if (!res.ok) {
      await logEvent({ transactionId: txn.id, type: "capture_failed", actor: "paypal", summary: `PayPal capture failed (HTTP ${res.status}).`, data: res.json });
      return NextResponse.json({ error: "PayPal capture failed", paypal: res.json }, { status: 502 });
    }
    const cap = res.json?.purchase_units?.[0]?.payments?.captures?.[0];
    if (!cap) return NextResponse.json({ error: "No capture in PayPal response", paypal: res.json }, { status: 502 });

    const upd = {
      paypal_capture_id: cap.id,
      paypal_status: cap.status,
      status: cap.status,
      amount: cap.amount?.value ?? txn.amount,
      currency: cap.amount?.currency_code ?? txn.currency,
      captured_at: cap.create_time ?? new Date().toISOString(),
      verified_at: new Date().toISOString(),
      payer_email: res.json?.payer?.email_address ?? null,
      payer_id: res.json?.payer?.payer_id ?? null,
      raw_capture: res.json,
    };
    const u = await d.from("transactions").update(upd).eq("id", txn.id).select("*").single();
    if (u.error) throw new Error(u.error.message);
    await logEvent({
      transactionId: txn.id, type: "payment_captured", actor: "paypal",
      summary: `PayPal Sandbox capture ${cap.id} returned status ${cap.status} for ${cap.amount?.currency_code} ${cap.amount?.value}.`,
    });
    return NextResponse.json({ transaction: u.data });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}