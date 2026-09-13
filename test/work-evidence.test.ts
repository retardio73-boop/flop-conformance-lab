import test from "node:test";
import assert from "node:assert/strict";
import { assertNoAllocationInference, portableWorkEvidence } from "../src/work-evidence.js";

const base = {
  agentDid: "did:key:z6Mkagent",
  payerDid: "did:key:z6Mkpayer",
  sessionId: "session-1",
  minerDid: "did:key:z6Mkminer",
  source: { system: "fixture", ref: "local/1", observedAt: "2026-09-13T00:00:00Z" },
};

test("portable work evidence snapshots source data and hashes canonical content", () => {
  const input = { ...base, requestBytes: "req", responseBytes: "resp", workProofBytes: "proof" };
  const evidence = portableWorkEvidence(input);
  assert.equal(evidence.state, "EXECUTION_VERIFIED");
  assert.equal(evidence.allocationCredit, "NOT_DERIVED");
  assert.equal(evidence.sha256.length, 64);
  input.sessionId = "mutated";
  assert.equal(evidence.input.sessionId, "session-1");
  assertNoAllocationInference(evidence);
});

test("settlement evidence is classified separately from execution", () => {
  const evidence = portableWorkEvidence({
    ...base,
    requestBytes: "req",
    responseBytes: "resp",
    workProofBytes: "proof",
    settlementBytes: "settlement",
    settlementAmount: "42",
    settlementAsset: "FLOP",
  });
  assert.equal(evidence.state, "SETTLEMENT_VERIFIED");
  assert.equal(evidence.allocationCredit, "NOT_DERIVED");
});

test("partial observation never fabricates execution or settlement", () => {
  const evidence = portableWorkEvidence(base);
  assert.equal(evidence.state, "OBSERVED");
  assert.equal(evidence.allocationCredit, "NOT_DERIVED");
});
