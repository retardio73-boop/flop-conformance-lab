import {
  dealRoom,
  encodeFrame,
  foldTranscript,
  generateHashLock,
  makeAccept,
  makeOffer,
  verifyTranscriptRecord,
} from "@flop-labs/tclk";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64urlnopad } from "@scure/base";

const T0 = 1_780_000_000_000;
const PAYER_SEED = Uint8Array.from(Array.from({ length: 32 }, (_, i) => i + 1));
const PAYEE_SEED = Uint8Array.from(Array.from({ length: 32 }, (_, i) => 64 - i));

function didFromSeed(seed) {
  const pub = ed25519.getPublicKey(seed);
  const tagged = new Uint8Array(34);
  tagged[0] = 0xed;
  tagged[1] = 0x01;
  tagged.set(pub, 2);
  return `did:key:z${base58.encode(tagged)}`;
}

function signRecord(seed, room, nonce, line, seq, timestampMs) {
  const canonical = `${room}|${nonce}|${line}`;
  return {
    room,
    seq,
    timestampMs,
    sender: didFromSeed(seed),
    nonce,
    signature: base64urlnopad.encode(ed25519.sign(new TextEncoder().encode(canonical), seed)),
    line,
  };
}

const payerDid = didFromSeed(PAYER_SEED);
const payeeDid = didFromSeed(PAYEE_SEED);
const { preimage, hash } = generateHashLock();
const offer = makeOffer({
  from: payerDid,
  role: "payer",
  lock: "hash",
  amount: "1000000",
  asset: "FLOP",
  rails: ["paper"],
  claimByMs: T0 + 3_600_000,
  refundAfterMs: T0 + 7_200_000,
  expiresMs: T0 + 600_000,
  nonce: "0011223344556677",
});
const accept = makeAccept(offer, {
  from: payeeDid,
  statement: hash,
  nonce: "8899aabbccddeeff",
});
const room = dealRoom(accept.contract);

const lock = {
  type: "lock",
  from: payerDid,
  contract: accept.contract,
  rail: "paper",
  ref: "paper-96",
};
const reveal = {
  type: "reveal",
  from: payeeDid,
  contract: accept.contract,
  ref: "paper-96",
  secret: `0x${Buffer.from(preimage).toString("hex")}`,
};
const refund = {
  type: "refund",
  from: payerDid,
  contract: accept.contract,
  ref: "paper-96",
  reason: "deadline",
};

const lines = [encodeFrame(offer), encodeFrame(accept), encodeFrame(lock), encodeFrame(reveal), encodeFrame(refund)];
const honestTimes = [T0, T0 + 1_000, T0 + 2_000, T0 + 1_800_000, T0 + 7_205_000];
const rooms = ["tclk-offers", "tclk-offers", room, room, room];
const seeds = [PAYER_SEED, PAYEE_SEED, PAYER_SEED, PAYEE_SEED, PAYER_SEED];
const honest = lines.map((line, i) => signRecord(seeds[i], rooms[i], String(1000 + i), line, i, honestTimes[i]));
const tampered = honest.map((record) => ({ ...record }));
tampered[3].timestampMs = T0 + 7_210_000;

for (const record of honest) {
  if (!verifyTranscriptRecord(record).ok) throw new Error("HONEST_SIGNATURE_DID_NOT_VERIFY");
}
for (const record of tampered) {
  if (!verifyTranscriptRecord(record).ok) throw new Error("TAMPERED_SIGNATURE_DID_NOT_VERIFY");
}

const honestFold = foldTranscript(honest);
const tamperedFold = foldTranscript(tampered);
if (honestFold.state?.status !== "claimed") throw new Error(`EXPECTED_CLAIMED_GOT_${honestFold.state?.status}`);
if (tamperedFold.state?.status !== "refunded") throw new Error(`EXPECTED_REFUNDED_GOT_${tamperedFold.state?.status}`);

console.log(JSON.stringify({
  issue: 96,
  upstreamCommit: "5cc4ab93efbc8999a3a7e1471b639deca25998ea",
  allSignaturesValid: true,
  onlyChangedField: "reveal.timestampMs",
  honest: honestFold.state.status,
  tampered: tamperedFold.state.status,
  result: "REPRODUCED",
}, null, 2));
