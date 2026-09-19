import test from "node:test";
import assert from "node:assert/strict";
import { validateProtocolDriftObservatory } from "../src/protocol-drift-observatory.js";

test("protocol drift observatory tracks the current formal canaries", () => {
  const result = validateProtocolDriftObservatory() as any;
  assert.equal(result.schema, "flop.protocol-drift-observatory.v1");
  assert.equal(result.canaries, 8);
  assert.equal(result.states["yellowpaper-56"], "OPEN_ISSUE");
  assert.equal(result.states["yellowpaper-57"], "OPEN_ISSUE");
  assert.equal(result.states["yellowpaper-58"], "OPEN_ISSUE");
  assert.equal(result.states["technocore-851"], "PROVISIONAL_PR");
  assert.equal(result.policy.issueClosureAlonePromotes, false);
  assert.equal(result.policy.requirePinnedResolutionEvidence, true);
  assert.equal(result.policy.requireFixtureReplayBeforePromotion, true);
});
