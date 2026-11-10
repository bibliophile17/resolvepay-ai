/* eslint-disable @typescript-eslint/no-explicit-any */
import { requireEnv } from "./env";

const BASE = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

function assertSandbox() {
  if (!BASE.includes("sandbox")) throw new Error("Refusing to run: PAYPAL_BASE_URL is not a PayPal Sandbox URL.");
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  assertSandbox();
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const auth = Buffer.from(`${requireEnv("PAYPAL_CLIENT_ID")}:${requireEnv("PAYPAL_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${json.error_description ?? json.error ?? "unknown"}`);
  cached = { token: json.access_token, expires: Date.now() + Number(json.expires_in) * 1000 };
  return cached.token;
}

export type PayPalResult = { ok: boolean; status: number; json: any };

async function call(path: string, method: "GET" | "POST", body?: unknown, requestId?: string): Promise<PayPalResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

export const createOrder = (p: {
  amount: string; currency: string; description: string; referenceId: string;
  returnUrl: string; cancelUrl: string; requestId: string;
}) =>
  call("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: p.referenceId, description: p.description, amount: { currency_code: p.currency, value: p.amount } }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "ResolvePay Demo Shop",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: p.returnUrl,
          cancel_url: p.cancelUrl,
        },
      },
    },
  }, p.requestId);

export const captureOrder = (orderId: string, requestId: string) =>
  call(`/v2/checkout/orders/${orderId}/capture`, "POST", undefined, requestId);

export const getCapture = (captureId: string) => call(`/v2/payments/captures/${captureId}`, "GET");

export const refundCapture = (captureId: string, value: string, currency: string, requestId: string, note: string) =>
  call(`/v2/payments/captures/${captureId}/refund`, "POST", {
    amount: { value, currency_code: currency },
    note_to_payer: note.slice(0, 250),
  }, requestId);