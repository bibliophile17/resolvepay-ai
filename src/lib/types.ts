/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export type ComplaintType = "damaged_product" | "duplicate_charge" | "other" | "unclassified";
export type Recommendation = "full_refund" | "partial_refund" | "request_more_info" | "manual_review";
export type EvidenceSource = "verified" | "customer" | "merchant" | "system";
export type EvidenceItem = { key: string; label: string; source: EvidenceSource; met: boolean; detail: string };
export const REFUND_RECS: Recommendation[] = ["full_refund", "partial_refund"];