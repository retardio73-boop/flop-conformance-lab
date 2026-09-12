import test from "node:test";
import assert from "node:assert/strict";
import { classifyDemandEvidence, validateDemandIndependenceFixture } from "../src/index.js";

test("co-signed settled receipt does not prove independent demand", () => {
  const result = classifyDemandEvidence({
    distinctDids: 2,
    coSignedPaidReceipt: true,
    settlementVerified: true,
  });

  assert.equal(result.settlement, "SETTLED_CO_SIGNED");
  assert.equal(result.demandIndependence, "UNVERIFIED");
  assert.equal(result.operatorCount, "UNVERIFIED");
  assert.equal(result.allocationCredit, "NOT_DERIVED");
  assert.ok(result.reasons.includes("CO_SIGNED_SETTLEMENT_DOES_NOT_PROVE_INDEPENDENT_DEMAND"));
  assert.ok(result.reasons.includes("DID_COUNT_DOES_NOT_PROVE_OPERATOR_COUNT"));
});

test("large DID count is not converted into operator count or Agents credit", () => {
  const result = classifyDemandEvidence({
    distinctDids: 10000,
    coSignedPaidReceipt: false,
    settlementVerified: false,
  });

  assert.equal(result.settlement, "UNVERIFIED");
  assert.equal(result.demandIndependence, "UNVERIFIED");
  assert.equal(result.operatorCount, "UNVERIFIED");
  assert.equal(result.allocationCredit, "NOT_DERIVED");
  assert.ok(result.reasons.includes("DID_COUNT_DOES_NOT_PROVE_OPERATOR_COUNT"));
  assert.ok(result.reasons.includes("E38_E40_ALLOCATION_POLICY_NOT_DERIVED"));
});

test("E.49 fixture remains open-issue, fail-closed evidence classification", () => {
  const result = validateDemandIndependenceFixture();
  assert.equal(result.classification, "OPEN_ISSUE_BOUNDARY");
  assert.equal(result.upstreamIssue, 58);
  assert.equal(result.openItem, "E.49");
  assert.equal(result.demandIndependence, "UNVERIFIED");
  assert.equal(result.operatorCount, "UNVERIFIED");
  assert.equal(result.allocationCredit, "NOT_DERIVED");
});

test("invalid DID counts fail closed", () => {
  assert.throws(
    () => classifyDemandEvidence({ distinctDids: -1, coSignedPaidReceipt: false, settlementVerified: false }),
    /INVALID_DISTINCT_DID_COUNT/,
  );
});
