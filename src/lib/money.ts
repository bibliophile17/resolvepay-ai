export const toCents = (v: string | number) => Math.round(Number(v) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);
export const fmt = (v: string | number | null | undefined, cur = "USD") =>
  v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Number(v));
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC" : "—";