import { POLICY } from "./policy";
import { toCents } from "./money";
import type { ComplaintType, EvidenceItem } from "./types";

export type EvidenceInput = {
  type: ComplaintType;
  txn: {
    amount: string | number;
    paypal_status: string | null;
    verified_at: string | null;
    paypal_capture_id: string | null;
    captured_at: string | null;
  };
  complaintText: string;
  requestedAmount: number | null;
  photoCount: number;
  duplicateIds: string[];
  refundedCents: number;
};

export function remainingCents(amount: string | number, refundedCents: number) {
  return Math.max(0, toCents(amount) - refundedCents);
}

// Deterministic rules only. No AI is involved in deciding what counts as met.
export function evaluateEvidence(i: EvidenceInput) {
  const remaining = remainingCents(i.txn.amount, i.refundedCents);
  const verified =
    !!i.txn.verified_at && !!i.txn.paypal_capture_id && ["COMPLETED", "PARTIALLY_REFUNDED"].includes(i.txn.paypal_status ?? "");
  const ageDays = i.txn.captured_at ? (Date.now() - new Date(i.txn.captured_at).getTime()) / 86_400_000 : Infinity;
  const requested = i.requestedAmount != null ? toCents(i.requestedAmount) : remaining;
  const text = i.complaintText.trim();

  const items: EvidenceItem[] = [
    {
      key: "payment_verified", label: "Payment verified with PayPal", source: "verified", met: verified,
      detail: verified ? `Capture ${i.txn.paypal_capture_id} confirmed by PayPal as ${i.txn.paypal_status}.` : "The backend has not confirmed a completed capture with PayPal.",
    },
    { key: "complaint_linked", label: "Complaint linked to a transaction", source: "system", met: true, detail: "The case references a transaction in the merchant records." },
    { key: "policy_available", label: "Merchant refund policy available", source: "merchant", met: true, detail: `Policy on file: ${POLICY.refundWindowDays}-day refund window.` },
    {
      key: "within_window", label: `Within ${POLICY.refundWindowDays}-day refund window`, source: "verified", met: ageDays <= POLICY.refundWindowDays,
      detail: Number.isFinite(ageDays) ? `Captured ${ageDays.toFixed(1)} days ago.` : "Capture date unknown.",
    },
    {
      key: "amount_valid", label: "Requested amount within refundable balance", source: "verified",
      met: remaining > 0 && requested > 0 && requested <= remaining,
      detail: `Refundable balance: ${(remaining / 100).toFixed(2)}; requested: ${(requested / 100).toFixed(2)}.`,
    },
  ];

  if (i.type === "damaged_product") {
    items.push(
      { key: "photo_provided", label: "Photo of the damaged product", source: "customer", met: i.photoCount > 0, detail: i.photoCount > 0 ? `${i.photoCount} photo(s) received.` : "No photo received yet." },
      { key: "damage_description", label: "Description of the damage", source: "customer", met: text.length >= 20, detail: text.length >= 20 ? "Customer described the issue." : "Description is too short to assess." },
    );
  }
  if (i.type === "duplicate_charge") {
    items.push(
      {
        key: "duplicate_found", label: "Duplicate payment found in records", source: "verified", met: i.duplicateIds.length > 0,
        detail: i.duplicateIds.length > 0 ? `Another payment with the same payer, amount and currency within 24h: ${i.duplicateIds.join(", ")}.` : "No matching payment from the same payer within 24 hours.",
      },
      { key: "customer_statement", label: "Customer statement provided", source: "customer", met: text.length >= 10, detail: text.length >= 10 ? "Statement received." : "No statement." },
    );
  }

  const met = items.filter((x) => x.met).length;
  // Evidence completeness only. NOT a dispute win probability and NOT a truthfulness score.
  return { items, score: Math.round((100 * met) / items.length) };
}