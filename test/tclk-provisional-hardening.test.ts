import test from "node:test";
import assert from "node:assert/strict";
import { makeOffer, type TclkStatus } from "@flop-labs/tclk";
import {
  assertTclkStatus,
  portableEvidenceSnapshot,
  snapshotOfferForEvidence,
  snapshotPresigForEvidence,
} from "../src/tclk-provisional-hardening.js";

const DID = "did:key:z6Mkffffffffffffffffffffffffffffffffffffffffffff";

function offer() {
  return makeOffer({
    from: DID,
    role: "payer",
    amount: "10",
    asset: "FLOP",
    lock: "hash",
    rails: ["flop-htlc", "x402"],
    claimByMs: 2000,
    refundAfterMs: 3000,
    expiresMs: 1000,
    job: { proto: "a2a", id: "before", context: "ctx-1" },
    nonce: "0011223344556677",
  });
}

test("provisional #160 boundary rejects serializer statuses outside the parser contract", () => {
  assert.doesNotThrow(() => assertTclkStatus("locked"));
  assert.throws(() => assertTclkStatus("exploded" as TclkStatus), /TCLK_STATUS_OUT_OF_CONTRACT/);
});

test("provisional #161 boundary snapshots accepted offer terms", () => {
  const original = offer();
  const snapshot = snapshotOfferForEvidence(original);

  original.refundAfterMs = 1;
  original.rails[0] = "paper";
  if (original.job) original.job.id = "after";

  assert.equal(snapshot.refundAfterMs, 3000);
  assert.deepEqual(snapshot.rails, ["flop-htlc", "x402"]);
  assert.equal(snapshot.job?.id, "before");
});

test("provisional #161 boundary snapshots lock pre-signature", () => {
  const original = { nonce: `0x02${"22".repeat(32)}`, s: "0x01" };
  const snapshot = snapshotPresigForEvidence(original);
  original.s = "0x02";
  assert.equal(snapshot?.s, "0x01");
});

test("accepted refund deadline cannot be rewritten through caller-owned object mutation", () => {
  const original = offer();
  const accepted = snapshotOfferForEvidence(original);
  const beforeDeadline = accepted.refundAfterMs - 1;

  original.refundAfterMs = beforeDeadline - 100;

  assert.equal(beforeDeadline < accepted.refundAfterMs, true);
  assert.equal(beforeDeadline >= original.refundAfterMs, true);
});

test("portable evidence preserves canonical bytes and digest after source mutation", () => {
  const original = offer();
  const evidence = portableEvidenceSnapshot(original);

  original.refundAfterMs = 1;
  original.rails[0] = "paper";

  assert.notEqual(portableEvidenceSnapshot(original).sha256, evidence.sha256);
  assert.match(evidence.canonicalBytes, /"refundAfterMs":3000/);
  assert.match(evidence.canonicalBytes, /"flop-htlc"/);
});
