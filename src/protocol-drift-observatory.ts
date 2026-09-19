import { readFileSync } from "node:fs";

type Canary = {
  id: string;
  upstream: string;
  state: "OPEN_ISSUE" | "PROVISIONAL_PR" | "FIELD_REPORT";
  fixture: string;
  promotion: "TARGET_SPEC" | "RELEASE_CONFORMANCE";
};

type ObservatoryFixture = {
  schema: string;
  policy: {
    issueClosureAlonePromotes: boolean;
    requirePinnedResolutionEvidence: boolean;
    requireFixtureReplayBeforePromotion: boolean;
  };
  canaries: Canary[];
};

const FIXTURE_URL = new URL(
  "../conformance/fixtures/protocol-drift-observatory-v1.json",
  import.meta.url,
);

export function validateProtocolDriftObservatory(): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as ObservatoryFixture;
  if (fixture.schema !== "flop.protocol-drift-observatory.v1") {
    throw new Error("PROTOCOL_DRIFT_SCHEMA_DIVERGENCE");
  }
  if (fixture.policy.issueClosureAlonePromotes) {
    throw new Error("PROTOCOL_DRIFT_MUST_NOT_PROMOTE_ON_CLOSE_ONLY");
  }
  if (!fixture.policy.requirePinnedResolutionEvidence || !fixture.policy.requireFixtureReplayBeforePromotion) {
    throw new Error("PROTOCOL_DRIFT_PROMOTION_GUARDS_MISSING");
  }

  const required = [
    "yellowpaper-56",
    "yellowpaper-57",
    "yellowpaper-58",
    "technocore-851",
    "tclk-147",
    "tclk-151",
    "tclk-158",
    "tclk-149",
  ];
  const ids = new Set(fixture.canaries.map((item) => item.id));
  for (const id of required) {
    if (!ids.has(id)) throw new Error(`PROTOCOL_DRIFT_CANARY_MISSING_${id}`);
  }
  for (const item of fixture.canaries) {
    if (!item.fixture.endsWith(".json")) throw new Error(`PROTOCOL_DRIFT_FIXTURE_MISSING_${item.id}`);
  }

  return {
    schema: fixture.schema,
    canaries: fixture.canaries.length,
    states: Object.fromEntries(fixture.canaries.map((item) => [item.id, item.state])),
    policy: fixture.policy,
  };
}
