import test from "node:test";
import assert from "node:assert/strict";
import { makeDriftHandoff, recordReproduction } from "../src/drift-handoff.js";
import type { DriftEvent } from "../src/protocol-drift.js";

const event: DriftEvent = {
  sourceId: "yellowpaper-main",
  change: "SPEC_CHANGE",
  affected: ["flop.quote-open-channel-receipt"],
  previousFingerprint: "aaa",
  currentFingerprint: "bbb",
  previousResult: "PASS",
  currentResult: "UNKNOWN",
  action: "REGENERATION_REQUIRED",
};

test("drift creates a pending conformance handoff", () => {
  const handoff = makeDriftHandoff([event], "2026-09-17T06:00:00Z");
  assert.equal(handoff.items[0]?.beforeResult, "PASS");
  assert.equal(handoff.items[0]?.driftResult, "UNKNOWN");
  assert.equal(handoff.items[0]?.reproduction.status, "PENDING");
  assert.equal(handoff.items[0]?.action, "REGENERATION_REQUIRED");
});

test("only explicit reproduction can set PASS", () => {
  const pending = makeDriftHandoff([event]);
  const itemId = pending.items[0]!.id;
  const complete = recordReproduction(
    pending,
    itemId,
    "PASS",
    "conformance-report.json#flop.quote-open-channel-receipt",
    "Regenerated against pinned upstream revision",
    "2026-09-17T06:10:00Z",
  );
  assert.equal(complete.items[0]?.reproduction.status, "PASS");
  assert.equal(complete.items[0]?.reproduction.evidenceRef, "conformance-report.json#flop.quote-open-channel-receipt");
});

test("reproduction without evidence fails closed", () => {
  const pending = makeDriftHandoff([event]);
  assert.throws(
    () => recordReproduction(pending, pending.items[0]!.id, "PASS", ""),
    /REPRODUCTION_EVIDENCE_REQUIRED/,
  );
});
