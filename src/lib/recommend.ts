import type { ComplaintType, EvidenceItem, Recommendation } from "./types";

const SEVERITY: Record<Recommendation, number> = { full_refund: 0, partial_refund: 1, request_more_info: 2, manual_review: 3 };

export type Baseline = { rec: Recommendation; amountCents: number | null; reason: string };

export function baseline(i: {
  type: ComplaintType;
  items: EvidenceItem[];
  remainingCents: number;
  isOriginalOfDuplicate: boolean;
}): Baseline {
  const met = (k: string) => i.items.find((x) => x.key === k)?.met === true;
  if (!met("payment_verified") || !met("amount_valid"))
    return { rec: "manual_review", amountCents: null, reason: "Payment or requested amount could not be validated." };
  if (!met("within_window"))
    return { rec: "manual_review", amountCents: null, reason: "Outside the refund window; this needs merchant discretion." };
  if (i.type === "damaged_product") {
    if (!met("photo_provided") || !met("damage_description"))
      return { rec: "request_more_info", amountCents: null, reason: "Required customer evidence (photo and description) is incomplete." };
    return { rec: "full_refund", amountCents: i.remainingCents, reason: "Policy: damaged items with photo evidence qualify for a full refund." };
  }
  if (i.type === "duplicate_charge") {
    if (!met("duplicate_found"))
      return { rec: "manual_review", amountCents: null, reason: "No duplicate payment exists in the verified records." };
    if (i.isOriginalOfDuplicate)
      return { rec: "manual_review", amountCents: null, reason: "The linked payment is the original charge; the later duplicate should be linked instead." };
    return { rec: "full_refund", amountCents: i.remainingCents, reason: "Policy: confirmed duplicate charges are refunded in full." };
  }
  return { rec: "manual_review", amountCents: null, reason: "Complaint type is not covered by an automatic rule." };
}

// The backend keeps the MORE CAUTIOUS of the rule baseline and the AI suggestion. AI can never upgrade to a refund.
export function finalize(aiRec: Recommendation | null, aiAmount: number | null, base: Baseline) {
  const notes: string[] = [];
  let final = base.rec;
  if (!aiRec) {
    notes.push("AI was unavailable or invalid; the recommendation comes from the deterministic rule baseline only.");
  } else if (SEVERITY[aiRec] > SEVERITY[base.rec]) {
    final = aiRec;
    notes.push(`AI suggested the more cautious option (${aiRec}) than the rule baseline (${base.rec}); the cautious option was kept.`);
  } else if (SEVERITY[aiRec] < SEVERITY[base.rec]) {
    notes.push(`AI suggested ${aiRec}, but the evidence rules only support ${base.rec}; the AI suggestion was overridden.`);
  }

  let amountCents: number | null = null;
  if (final === "full_refund") amountCents = base.amountCents;
  if (final === "partial_refund") {
    const want = aiAmount != null ? Math.round(aiAmount * 100) : 0;
    const cap = base.amountCents ?? 0;
    if (want > 0 && cap > 0) amountCents = Math.min(want, cap);
    else {
      final = "manual_review";
      notes.push("Partial refund amount was missing or invalid, so the case was escalated to manual review.");
    }
  }
  return { final, amountCents, notes };
}