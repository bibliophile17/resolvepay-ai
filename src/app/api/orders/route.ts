import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/supabase";
import { createOrder } from "@/lib/paypal";
import { logEvent } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const description = String(body.description ?? "").trim().slice(0, 120) || "Sandbox demo order";
    if (!Number.isFinite(amount) || amount < 1 || amount > 500)
      return NextResponse.json({ error: "Amount must be between 1 and 500 USD." }, { status: 400 });

    const origin = new URL(req.url).origin;
    const res = await createOrder({
      amount: amount.toFixed(2), currency: "USD", description, referenceId: "demo-" + Date.now(),
      returnUrl: `${origin}/payment/return`, cancelUrl: `${origin}/transactions?cancelled=1`, requestId: randomUUID(),
    });
    if (!res.ok) return NextResponse.json({ error: "PayPal rejected the order", paypal: res.json }, { status: 502 });

    const approveUrl = (res.json.links ?? []).find((l: { rel: string; href: string }) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!approveUrl) return NextResponse.json({ error: "PayPal returned no approval link", paypal: res.json }, { status: 502 });

    const ins = await db().from("transactions")
      .insert({ paypal_order_id: res.json.id, description, amount: amount.toFixed(2), currency: "USD", status: "created" })
      .select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    await logEvent({
      transactionId: ins.data.id, type: "payment_order_created", actor: "paypal",
      summary: `PayPal Sandbox order ${res.json.id} created for USD ${amount.toFixed(2)}.`,
    });
    return NextResponse.json({ approveUrl, transactionId: ins.data.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}