import { readFileSync } from "node:fs";

export type StakeTreatment = "LOCKED" | "BURNED" | "SLASHABLE" | "UNRESOLVED";

export interface SybilEconomicsInput {
  identityCount: number;
  stakePerIdentity: string;
  stakeTreatment: StakeTreatment;
  consumedFeePerIdentity: string;
  opportunityCostPpm: number;
  hypotheticalRewardPerIdentity: string;
}

export interface SybilEconomicsResult {
  identityCount: number;
  stakeTreatment: StakeTreatment;
  lockedCapital: string;
  burnedCapital: string;
  consumedFees: string;
  opportunityCost: string;
  consumedCost: string;
  attributableReward: string;
  deterrenceInequality: "SATISFIED" | "NOT_SATISFIED" | "UNRESOLVED";
  normativeConclusion: "NOT_DERIVED";
  reasons: string[];
}

type CanaryCriterion = { id: string; satisfied: boolean; requirement: string };

type SybilFixture = {
  schemaVersion: string;
  id: string;
  classification: "OPEN_ISSUE_BOUNDARY_WITH_LOCAL_MODEL";
  upstream: {
    repository: string;
    version: string;
    issue: number;
    openItems: string[];
    agentIdentityMinStake: string;
  };
  model: {
    status: "LOCAL_NON_NORMATIVE";
    inequality: string;
    rewardInputsAreHypothetical: boolean;
    assumptions: string[];
  };
  scenarios: Array<SybilEconomicsInput & { id: string }>;
  promotionCanary: {
    currentStatus: "OPEN_ISSUE";
    targetStatus: "TARGET_SPEC";
    criteria: CanaryCriterion[];
  };
  empiricalLane: {
    status: "WAITING_FOR_PUBLIC_DATASET";
    sourceClaim: string;
    acceptanceRequirements: string[];
    importedObservations: number;
  };
  scope: Record<string, boolean>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseUint(value: string, label: string): bigint {
  assert(/^(0|[1-9][0-9]*)$/.test(value), `${label}_MUST_BE_UINT_STRING`);
  return BigInt(value);
}

export function evaluateSybilEconomics(input: SybilEconomicsInput): SybilEconomicsResult {
  assert(Number.isSafeInteger(input.identityCount) && input.identityCount > 0, "INVALID_IDENTITY_COUNT");
  assert(Number.isSafeInteger(input.opportunityCostPpm) && input.opportunityCostPpm >= 0 && input.opportunityCostPpm <= 1_000_000, "INVALID_OPPORTUNITY_COST_PPM");

  const n = BigInt(input.identityCount);
  const stake = parseUint(input.stakePerIdentity, "STAKE_PER_IDENTITY");
  const fee = parseUint(input.consumedFeePerIdentity, "CONSUMED_FEE_PER_IDENTITY");
  const reward = parseUint(input.hypotheticalRewardPerIdentity, "HYPOTHETICAL_REWARD_PER_IDENTITY");

  const totalStake = stake * n;
  const lockedCapital = input.stakeTreatment === "BURNED" ? 0n : totalStake;
  const burnedCapital = input.stakeTreatment === "BURNED" ? totalStake : 0n;
  const consumedFees = fee * n;
  const opportunityCost = (lockedCapital * BigInt(input.opportunityCostPpm)) / 1_000_000n;
  const consumedCost = burnedCapital + consumedFees + opportunityCost;
  const attributableReward = reward * n;

  let deterrenceInequality: SybilEconomicsResult["deterrenceInequality"];
  if (input.stakeTreatment === "UNRESOLVED" || input.stakeTreatment === "SLASHABLE") {
    deterrenceInequality = "UNRESOLVED";
  } else {
    deterrenceInequality = consumedCost >= attributableReward ? "SATISFIED" : "NOT_SATISFIED";
  }

  const reasons = ["MODEL_IS_LOCAL_AND_NON_NORMATIVE", "HYPOTHETICAL_REWARD_IS_NOT_A_PROTOCOL_PARAMETER"];
  if (input.stakeTreatment === "LOCKED") reasons.push("REFUNDABLE_LOCK_IS_CAPITAL_NOT_CONSUMED_COST");
  if (input.stakeTreatment === "BURNED") reasons.push("BURNED_STAKE_COUNTS_AS_CONSUMED_COST_IN_THIS_SCENARIO");
  if (input.stakeTreatment === "SLASHABLE") reasons.push("SLASH_PROBABILITY_AND_CONDITION_UNRESOLVED");
  if (input.stakeTreatment === "UNRESOLVED") reasons.push("STAKE_TREATMENT_UNRESOLVED_UPSTREAM");

  return {
    identityCount: input.identityCount,
    stakeTreatment: input.stakeTreatment,
    lockedCapital: lockedCapital.toString(),
    burnedCapital: burnedCapital.toString(),
    consumedFees: consumedFees.toString(),
    opportunityCost: opportunityCost.toString(),
    consumedCost: consumedCost.toString(),
    attributableReward: attributableReward.toString(),
    deterrenceInequality,
    normativeConclusion: "NOT_DERIVED",
    reasons,
  };
}

export function validateSybilEconomicsFixture(): Record<string, unknown> {
  const fixture = JSON.parse(
    readFileSync(new URL("../conformance/fixtures/yellowpaper-58-sybil-economics-v0.5.0.json", import.meta.url), "utf8"),
  ) as SybilFixture;

  assert(fixture.schemaVersion === "1", "SYBIL_FIXTURE_SCHEMA_DIVERGENCE");
  assert(fixture.classification === "OPEN_ISSUE_BOUNDARY_WITH_LOCAL_MODEL", "SYBIL_FIXTURE_CLASSIFICATION_DIVERGENCE");
  assert(fixture.upstream.repository === "flop-labs/yellowpaper", "SYBIL_FIXTURE_REPOSITORY_DIVERGENCE");
  assert(fixture.upstream.issue === 58, "ISSUE_58_NOT_PINNED");
  assert(fixture.upstream.openItems.includes("E.49"), "E49_NOT_PINNED");
  assert(fixture.upstream.agentIdentityMinStake === "10", "AGENT_IDENTITY_MIN_STAKE_PIN_DIVERGENCE");
  assert(fixture.model.status === "LOCAL_NON_NORMATIVE", "SYBIL_MODEL_MUST_BE_LOCAL");
  assert(fixture.model.rewardInputsAreHypothetical, "REWARD_INPUTS_MUST_BE_HYPOTHETICAL");

  const results = fixture.scenarios.map((scenario) => ({ id: scenario.id, ...evaluateSybilEconomics(scenario) }));
  const locked = results.find((item) => item.id === "locked-10k-zero-reward");
  assert(locked !== undefined, "LOCKED_10K_SCENARIO_MISSING");
  assert(locked.lockedCapital === "100000", "LOCKED_10K_CAPITAL_DIVERGENCE");
  assert(locked.burnedCapital === "0", "LOCKED_STAKE_MUST_NOT_BE_COUNTED_AS_BURN");
  assert(locked.reasons.includes("REFUNDABLE_LOCK_IS_CAPITAL_NOT_CONSUMED_COST"), "LOCKED_CAPITAL_GUARD_MISSING");

  const unresolved = results.find((item) => item.id === "unresolved-10k-hypothetical-linear-reward");
  assert(unresolved !== undefined, "UNRESOLVED_REWARD_SCENARIO_MISSING");
  assert(unresolved.deterrenceInequality === "UNRESOLVED", "UNRESOLVED_STAKE_MUST_NOT_PRODUCE_DETERRENCE_CLAIM");
  assert(unresolved.normativeConclusion === "NOT_DERIVED", "LOCAL_MODEL_MUST_NOT_BECOME_NORMATIVE");

  const requiredCriteria = [
    "stake-treatment-defined",
    "independent-demand-defined",
    "multi-did-attribution-rule-defined",
    "agent-allocation-formula-defined",
    "per-did-benefit-rule-defined",
    "wash-spend-treatment-defined",
  ];
  for (const id of requiredCriteria) {
    const criterion = fixture.promotionCanary.criteria.find((item) => item.id === id);
    assert(criterion !== undefined, `MISSING_PROMOTION_CRITERION:${id}`);
    assert(criterion.satisfied === false, `PROMOTION_CRITERION_MUST_REMAIN_OPEN:${id}`);
  }
  assert(fixture.promotionCanary.currentStatus === "OPEN_ISSUE", "ISSUE_58_CANARY_MUST_REMAIN_OPEN");
  assert(fixture.promotionCanary.targetStatus === "TARGET_SPEC", "ISSUE_58_CANARY_TARGET_DIVERGENCE");

  assert(fixture.empiricalLane.status === "WAITING_FOR_PUBLIC_DATASET", "EMPIRICAL_LANE_MUST_WAIT_FOR_DATASET");
  assert(fixture.empiricalLane.importedObservations === 0, "UNVERIFIED_EMPIRICAL_DATA_MUST_NOT_BE_IMPORTED");

  assert(!fixture.scope.sybilDetector, "FIXTURE_MUST_NOT_CLAIM_SYBIL_DETECTOR");
  assert(!fixture.scope.operatorAttribution, "FIXTURE_MUST_NOT_CLAIM_OPERATOR_ATTRIBUTION");
  assert(!fixture.scope.faucetRule, "FIXTURE_MUST_NOT_INVENT_FAUCET_RULE");
  assert(!fixture.scope.airdropFormula, "FIXTURE_MUST_NOT_INVENT_AIRDROP_FORMULA");
  assert(!fixture.scope.normativeEconomics, "FIXTURE_MUST_NOT_CLAIM_NORMATIVE_ECONOMICS");

  return {
    fixture: fixture.id,
    classification: fixture.classification,
    upstreamIssue: fixture.upstream.issue,
    scenarios: results.length,
    promotionStatus: fixture.promotionCanary.currentStatus,
    promotionCriteriaSatisfied: fixture.promotionCanary.criteria.filter((item) => item.satisfied).length,
    promotionCriteriaTotal: fixture.promotionCanary.criteria.length,
    empiricalLane: fixture.empiricalLane.status,
    importedObservations: fixture.empiricalLane.importedObservations,
  };
}
