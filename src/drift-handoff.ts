import type { DriftEvent } from "./protocol-drift.js";

export type ReproductionStatus = "PENDING" | "PASS" | "FAIL" | "UNKNOWN";

export type DriftHandoffItem = {
  id: string;
  sourceId: string;
  change: DriftEvent["change"];
  affected: string[];
  previousFingerprint: string | null;
  currentFingerprint: string;
  beforeResult: "PASS" | "UNKNOWN";
  driftResult: "UNKNOWN";
  action: "REGENERATION_REQUIRED";
  reproduction: {
    status: ReproductionStatus;
    evidenceRef: string | null;
    completedAt: string | null;
    note: string | null;
  };
};

export type DriftHandoff = {
  schema: "flop.drift-conformance-handoff.v1";
  createdAt: string;
  items: DriftHandoffItem[];
  claim: string;
};

export function makeDriftHandoff(
  events: DriftEvent[],
  createdAt = new Date().toISOString(),
): DriftHandoff {
  return {
    schema: "flop.drift-conformance-handoff.v1",
    createdAt,
    items: events.map((event, index) => ({
      id: `${event.sourceId}:${index}`,
      sourceId: event.sourceId,
      change: event.change,
      affected: [...event.affected],
      previousFingerprint: event.previousFingerprint,
      currentFingerprint: event.currentFingerprint,
      beforeResult: event.previousResult,
      driftResult: "UNKNOWN",
      action: "REGENERATION_REQUIRED",
      reproduction: {
        status: "PENDING",
        evidenceRef: null,
        completedAt: null,
        note: null,
      },
    })),
    claim: "Drift handoffs preserve before/change/result history. Only an explicit independent reproduction can set PASS or FAIL.",
  };
}

export function recordReproduction(
  handoff: DriftHandoff,
  itemId: string,
  result: Exclude<ReproductionStatus, "PENDING">,
  evidenceRef: string,
  note: string | null = null,
  completedAt = new Date().toISOString(),
): DriftHandoff {
  if (!evidenceRef) throw new Error("REPRODUCTION_EVIDENCE_REQUIRED");
  const items = handoff.items.map((item) => {
    if (item.id !== itemId) return item;
    if (item.reproduction.status !== "PENDING") {
      throw new Error(`REPRODUCTION_ALREADY_RECORDED_${itemId}`);
    }
    return {
      ...item,
      reproduction: {
        status: result,
        evidenceRef,
        completedAt,
        note,
      },
    };
  });
  if (!items.some((item) => item.id === itemId)) {
    throw new Error(`UNKNOWN_HANDOFF_ITEM_${itemId}`);
  }
  return { ...handoff, items };
}
