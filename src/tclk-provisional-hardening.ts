import { createHash } from "node:crypto";
import { canonicalJson, type OfferFrame, type PresigRef, type TclkStatus } from "@flop-labs/tclk";

const TCLK_STATUSES = new Set<TclkStatus>([
  "proposed",
  "accepted",
  "locked",
  "claimed",
  "refunded",
  "cancelled",
]);

/**
 * Defensive local boundary derived from open upstream PR #160.
 * This is LOCAL_POLICY / PROVISIONAL_PR hardening, not a claim about released TCLK semantics.
 */
export function assertTclkStatus(value: unknown): asserts value is TclkStatus {
  if (typeof value !== "string" || !TCLK_STATUSES.has(value as TclkStatus)) {
    throw new Error("TCLK_STATUS_OUT_OF_CONTRACT");
  }
}

/** Copy caller-owned offer data before it enters durable evidence/state. */
export function snapshotOfferForEvidence(offer: OfferFrame): OfferFrame {
  return {
    ...offer,
    rails: [...offer.rails],
    ...(offer.job === undefined ? {} : { job: { ...offer.job } }),
  };
}

/** Copy caller-owned lock pre-signature data before it enters durable evidence/state. */
export function snapshotPresigForEvidence(presig: PresigRef | undefined): PresigRef | undefined {
  return presig === undefined ? undefined : { ...presig };
}

export interface PortableEvidenceSnapshot {
  canonicalBytes: string;
  sha256: string;
}

/**
 * Freeze the evidence representation at the boundary: persist canonical bytes + digest,
 * never a mutable object reference. The caller may later mutate its source object without
 * rewriting the historical evidence.
 */
export function portableEvidenceSnapshot(value: unknown): PortableEvidenceSnapshot {
  const canonicalBytes = canonicalJson(value);
  return {
    canonicalBytes,
    sha256: createHash("sha256").update(canonicalBytes, "utf8").digest("hex"),
  };
}
