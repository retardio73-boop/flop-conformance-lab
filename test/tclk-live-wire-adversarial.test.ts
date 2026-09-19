import test from "node:test";
import assert from "node:assert/strict";
import { validateTclkLiveWireAdversarialFixture } from "../src/tclk-live-wire-adversarial.js";

test("TCLK live-wire adversarial corpus stays fail closed", () => {
  const result = validateTclkLiveWireAdversarialFixture() as any;
  assert.equal(result.schema, "tclk.live-wire-adversarial.v1");
  assert.equal(result.classification, "FIELD_EVIDENCE_FAIL_CLOSED");
  assert.equal(result.cases, 5);
  assert.ok(result.sources.includes("flop-labs/tclk#147"));
  assert.ok(result.sources.includes("flop-labs/tclk#151"));
  assert.ok(result.sources.includes("flop-labs/tclk#158"));
  assert.ok(result.sources.includes("flop-labs/tclk#149"));
});
