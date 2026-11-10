import type { ReactNode } from "react";

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "purple";
const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700", green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800", purple: "bg-purple-100 text-purple-800",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

export function Card({ title, subtitle, id, children }: { title?: string; subtitle?: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {subtitle && <p className="mb-3 mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      {!subtitle && title && <div className="mb-3" />}
      {children}
    </section>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1">{message}</p>
      <p className="mt-2 text-xs">Check .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and that supabase/schema.sql has been run.</p>
    </div>
  );
}

export function SandboxBadge() {
  return <Badge tone="amber">SANDBOX · no real money</Badge>;
}

export function statusTone(s: string): Tone {
  if (s === "refunded") return "green";
  if (s === "awaiting_decision") return "amber";
  if (s === "closed_no_refund") return "gray";
  if (s === "refund_in_progress" || s === "refund_pending") return "blue";
  return "purple";
}