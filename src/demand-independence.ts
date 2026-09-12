import { readFileSync } from "node:fs";

export type DemandSettlementEvidence =
  | "UNVERIFIED"
  | "SETTLED_CO_SIGNED";

export type DemandIndependenceEvidence =
  | "UNVERIFIED";

export type OperatorCountEvidence =
  | "UNVERIFIED";

export type AllocationEvidence =
  | "NOT_DERIVED";

export interface DemandObservation {
  distinctDids: number;
  coSignedPaidReceipt: boolean;
  settlementVerified: boolean;
}

export interface DemandEvidenceClassification {
  settlement: DemandSettlementEvidence;
  demandIndependence: DemandIndependenceEvidence;
  operatorCount: OperatorCountEvidence;
  allocationCredit: AllocationEvidence;
  reasons: string[];
}

interface DemandFixtureCase extends DemandObservation {
  id: string;
  expected: DemandEvidenceClassification;
}

interface DemandFixture {
  schemaVersion: string;
  id: string;
  classification: "OPEN_ISSUE_BOUNDARY";
  upstream: {
    repository: string;
    version: string;
    issue: number;
    openItem: string;
  };
  invariants: string[];
  cases: DemandFixtureCase[];
  scope: {
    sybilDetector: boolean;
    operatorAttribution: boolean;
    agentsAllocationFormula: boolean;
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function classifyDemandEvidence(input: DemandObservation): DemandEvidenceClassification {
  if (!Number.isSafeInteger(input.distinctDids) || input.distinctDids < 0) {
    throw new Error("INVALID_DISTINCT_DID_COUNT");
  }

  const settlement: DemandSettlementEvidence =
    input.coSignedPaidReceipt && input.settlementVerified
      ? "SETTLED_CO_SIGNED"
      : "UNVERIFIED";

  const reasons: string[] = [];
  if (settlement === "SETTLED_CO_SIGNED") {
    reasons.push("CO_SIGNED_SETTLEMENT_DOES_NOT_PROVE_INDEPENDENT_DEMAND");
  }
  if (input.distinctDids > 1) {
    reasons.push("DID_COUNT_DOES_NOT_PROVE_OPERATOR_COUNT");
  }
  reasons.push("E49_DEMAND_INDEPENDENCE_UNRESOLVED");
  reasons.push("E38_E40_ALLOCATION_POLICY_NOT_DERIVED");

  return {
    settlement,
    demandIndependence: "UNVERIFIED",
    operatorCount: "UNVERIFIED",
    allocationCredit: "NOT_DERIVED",
    reasons,
  };
}

export function validateDemandIndependenceFixture(): Record<string, unknown> {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../conformance/fixtures/yellowpaper-e49-demand-independence-v0.5.0.json", import.meta.url),
      "utf8",
    ),
  ) as DemandFixture;

  assert(fixture.schemaVersion === "1", "DEMAND_FIXTURE_SCHEMA_DIVERGENCE");
  assert(fixture.classification === "OPEN_ISSUE_BOUNDARY", "DEMAND_FIXTURE_CLASSIFICATION_DIVERGENCE");
  assert(fixture.upstream.repository === "flop-labs/yellowpaper", "DEMAND_FIXTURE_REPOSITORY_DIVERGENCE");
  assert(fixture.upstream.issue === 58, "ISSUE_58_NOT_PINNED");
  assert(fixture.upstream.openItem === "E.49", "E49_NOT_PINNED");

  for (const invariant of [
    "CO_SIGNED_SETTLED_RECEIPT_NE_INDEPENDENT_DEMAND",
    "DID_COUNT_NE_OPERATOR_COUNT",
    "NO_AGENTS_ALLOCATION_DERIVATION",
  ]) {
    assert(fixture.invariants.includes(invariant), `MISSING_DEMAND_INVARIANT:${invariant}`);
  }

  for (const item of fixture.cases) {
    const actual = classifyDemandEvidence(item);
    assert(actual.settlement === item.expected.settlement, `${item.id}:SETTLEMENT_DIVERGENCE`);
    assert(
      actual.demandIndependence === item.expected.demandIndependence,
      `${item.id}:DEMAND_INDEPENDENCE_DIVERGENCE`,
    );
    assert(actual.operatorCount === item.expected.operatorCount, `${item.id}:OPERATOR_COUNT_DIVERGENCE`);
    assert(actual.allocationCredit === item.expected.allocationCredit, `${item.id}:ALLOCATION_DIVERGENCE`);
    for (const reason of item.expected.reasons) {
      assert(actual.reasons.includes(reason), `${item.id}:MISSING_REASON:${reason}`);
    }
  }

  assert(!fixture.scope.sybilDetector, "FIXTURE_MUST_NOT_CLAIM_SYBIL_DETECTION");
  assert(!fixture.scope.operatorAttribution, "FIXTURE_MUST_NOT_CLAIM_OPERATOR_ATTRIBUTION");
  assert(!fixture.scope.agentsAllocationFormula, "FIXTURE_MUST_NOT_DERIVE_AGENTS_ALLOCATION");

  return {
    fixture: fixture.id,
    classification: fixture.classification,
    upstreamIssue: fixture.upstream.issue,
    openItem: fixture.upstream.openItem,
    cases: fixture.cases.length,
    demandIndependence: "UNVERIFIED",
    operatorCount: "UNVERIFIED",
    allocationCredit: "NOT_DERIVED",
  };
}
