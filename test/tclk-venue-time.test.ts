import test from "node:test";
import assert from "node:assert/strict";
import { assessTclkVenueTime, validateTclkIssue96Fixture } from "../src/tclk-venue-time.js";

test("issue #96 fixture reproduces the unsigned venue-time trust boundary", () => {
  const result = validateTclkIssue96Fixture();
  assert.equal(result.upstreamIssue, 96);
  assert.equal(result.terminalFlip, "claimed->refunded");
  assert.equal(result.signedMaterialUnchanged, true);
  assert.equal(result.trustBoundary, "UNTRUSTED_VENUE_TIME");
  assert.equal(result.failClosed, true);
  assert.equal(result.allowDeadlineVerdict, false);
});

test("deadline-sensitive transcript with unsigned venue time fails closed", () => {
  const result = assessTclkVenueTime({
    signatureValid: true,
    deadlineSensitive: true,
    venueTimestampAuthenticated: false,
  });
  assert.equal(result.status, "UNTRUSTED_VENUE_TIME");
  assert.equal(result.allowDeadlineVerdict, false);
  assert.equal(result.failClosed, true);
});

test("authenticated time may carry a deadline verdict through this boundary", () => {
  const result = assessTclkVenueTime({
    signatureValid: true,
    deadlineSensitive: true,
    venueTimestampAuthenticated: true,
  });
  assert.equal(result.status, "NO_UNSIGNED_TIME_DEPENDENCY");
  assert.equal(result.allowDeadlineVerdict, true);
});

test("invalid signatures remain independently fail-closed", () => {
  const result = assessTclkVenueTime({
    signatureValid: false,
    deadlineSensitive: false,
    venueTimestampAuthenticated: false,
  });
  assert.equal(result.status, "INVALID_SIGNATURE");
  assert.equal(result.allowDeadlineVerdict, false);
});
