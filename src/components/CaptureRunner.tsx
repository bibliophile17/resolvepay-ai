"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function CaptureRunner({ orderId }: { orderId: string }) {
  const started = useRef(false);
  const [state, setState] = useState<{ phase: "working" | "done" | "error"; message: string; detail?: string }>({ phase: "working", message: "Capturing your approved payment with PayPal Sandbox…" });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const res = await fetch("/api/orders/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const t = data.transaction;
        setState({ phase: "done", message: `Payment ${t.paypal_status}. Capture ID: ${t.paypal_capture_id}`, detail: `USD ${t.amount} from ${t.payer_email ?? "unknown payer"} (PayPal Sandbox)` });
      } else setState({ phase: "error", message: data.error ?? "Capture failed.", detail: data.paypal ? JSON.stringify(data.paypal, null, 2) : undefined });
    })();
  }, [orderId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <p className={state.phase === "error" ? "font-semibold text-red-700" : "font-semibold"}>{state.message}</p>
      {state.detail && <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs">{state.detail}</pre>}
      {state.phase !== "working" && <Link href="/transactions" className="mt-4 inline-block text-sm text-blue-700 underline">Back to transactions</Link>}
    </div>
  );
}