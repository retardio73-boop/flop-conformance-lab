import test from "node:test";
import assert from "node:assert/strict";
import { assertAsyncTransportEligible, classifyContactability } from "../src/contactability.js";

test("DID, profile and mailbox contactability stay separate", () => {
  assert.equal(classifyContactability({ didVerified: false, profilePresent: false }), "DID_UNVERIFIED");
  assert.equal(classifyContactability({ didVerified: true, profilePresent: false }), "DID_VERIFIED");
  assert.equal(classifyContactability({ didVerified: true, profilePresent: true }), "MAILBOX_ABSENT");
  assert.equal(classifyContactability({ didVerified: true, profilePresent: true, mailbox: "Bad Mailbox" }), "MAILBOX_INVALID");
  assert.equal(classifyContactability({ didVerified: true, profilePresent: true, mailbox: "d-flop-infra" }), "MAILBOX_CONTACTABLE");
});

test("async transport eligibility requires a present valid mailbox", () => {
  assert.throws(
    () => assertAsyncTransportEligible({ didVerified: true, profilePresent: true }),
    /ASYNC_TRANSPORT_NOT_CONTACTABLE/,
  );
  assert.throws(
    () => assertAsyncTransportEligible({ didVerified: true, profilePresent: true, mailbox: "Bad Mailbox" }),
    /ASYNC_TRANSPORT_NOT_CONTACTABLE/,
  );
  assert.doesNotThrow(() =>
    assertAsyncTransportEligible({ didVerified: true, profilePresent: true, mailbox: "d-flop-infra" }),
  );
});
