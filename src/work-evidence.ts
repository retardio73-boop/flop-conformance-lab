import { createHash } from "node:crypto";

export type WorkEvidenceState =
  | "OBSERVED"
  | "EXECUTION_VERIFIED"
  | "SETTLEMENT_VERIFIED"
  | "ALLOCATION_NOT_DERIVED";

export interface WorkEvidenceInput {
  agentDid?: string;
  payerDid?: string;
  sessionId?: string;
  minerDid?: string;
  requestBytes?: string;
  responseBytes?: string;
  workProofBytes?: string;
  settlementBytes?: string;
  settlementAmount?: string;
  settlementAsset?: string;
  source: {
    system: string;
    ref: string;
    observedAt: string;
  };
}

export interface PortableWorkEvidence {
  schema: "flop.work-evidence.v1";
  state: WorkEvidenceState;
  canonical: string;
  sha256: string;
  input: WorkEvidenceInput;
  allocationCredit: "NOT_DERIVED";
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

export function portableWorkEvidence(input: WorkEvidenceInput): PortableWorkEvidence {
  const hasExecution = Boolean(input.requestBytes && input.responseBytes && input.workProofBytes);
  const hasSettlement = Boolean(input.settlementBytes && input.settlementAmount && input.settlementAsset);
  const state: WorkEvidenceState = hasSettlement
    ? "SETTLEMENT_VERIFIED"
    : hasExecution
      ? "EXECUTION_VERIFIED"
      : "OBSERVED";
  const canonical = canonicalize({ schema: "flop.work-evidence.v1", state, input, allocationCredit: "NOT_DERIVED" });
  return {
    schema: "flop.work-evidence.v1",
    state,
    canonical,
    sha256: createHash("sha256").update(canonical, "utf8").digest("hex"),
    input: structuredClone(input),
    allocationCredit: "NOT_DERIVED",
  };
}

export function assertNoAllocationInference(evidence: PortableWorkEvidence): void {
  if (evidence.allocationCredit !== "NOT_DERIVED") throw new Error("ALLOCATION_INFERENCE_FORBIDDEN");
}
