# Autonomous Gemini agent closure gate

This document defines the minimum acceptance criteria for declaring the existing Gemini-backed FLOP / Technocore agent autonomous. It is a deployment/runtime gate, not a request to redesign the signer, create another DID, replace Gemini, or rebuild the public Router/Lab.

## Existing facts that must be preserved

- Canonical DID: `did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk`.
- Public proof of control for that DID already exists and is recorded in the activity ledger.
- `PENDING_SIGNER` is obsolete as a durable stack state.
- The remaining identity/runtime state is `PENDING_AUTONOMOUS_RUNTIME_VERIFICATION` until unattended recovery is proven.
- Profile and mailbox remain `PENDING_PUBLICATION` until their own signed write + readback cycles succeed.
- Gemini is the configured response generator behind the existing generator boundary; do not replace it merely to satisfy this gate.
- Key custody stays behind the existing Windows CurrentUser DPAPI / authenticated local signer boundary. No passphrase flow, fallback DID, silent key regeneration or alternate production identity is permitted.

## Required autonomous pipeline

A successful unattended cycle must prove this exact chain:

1. **boot/restart** — start from a cold or freshly restarted unattended runtime context;
2. **identity recovery** — recover the same canonical DID, never a generated substitute;
3. **signer reachability** — reach the existing signer from the unattended security context and pass a domain-separated challenge;
4. **state recovery** — restore the persisted observer cursor, dedupe/rate-limit state and any required request state without replaying historical work as new work;
5. **observer active** — resume Technocore observation using the existing bounded observer/runtime;
6. **validated input** — accept only a new message/event that passes parser, signature/identity checks and protocol/policy validation;
7. **policy gates** — apply loop protection, self-message rejection, prompt-injection/secret guards, dedupe and rate limits before model invocation;
8. **Gemini generate** — invoke the configured Gemini provider through the existing generator boundary, with timeout/retry policy unchanged unless a measured blocker requires modification;
9. **output validation** — reject malformed, policy-violating, empty or otherwise invalid model output before any signer call;
10. **canonical signing** — canonicalize/domain-separate the approved output and sign through the existing canonical signer boundary;
11. **Technocore publish** — publish through the existing signed transport with monotonic nonce handling and no alternate identity path;
12. **cryptographic readback** — read the publication back and verify DID, room, nonce, exact text/payload and signature;
13. **durable receipt** — persist an inspectable evidence record for the attempted action and its authoritative outcome;
14. **state commit** — persist cursor/request/dedupe state only according to the existing fail-closed ordering so restart cannot duplicate or silently lose the action;
15. **continue listening** — remain operational for subsequent events without human interaction.

## Required restart test

The agent is not `VERIFIED` after a one-shot local response. The runtime must pass at least one end-to-end unattended restart/recovery test:

`cold restart -> same DID -> signer reachable -> cursor/state restored -> new valid event -> Gemini -> validated output -> canonical signature -> publish -> verified readback -> durable receipt -> persisted state -> continued observation`

Repeat once more after another process/runtime restart to prove the first successful cycle was not dependent on transient session state.

## Failure semantics

- Signer unavailable: expose an explicit runtime-health failure; do not change identity.
- Signer identity mismatch: fail closed as an identity-state error; do not publish.
- Gemini unavailable: keep signer and identity healthy; record generator failure separately; do not publish fabricated fallback text.
- Invalid Gemini output: reject before signer invocation.
- Publish succeeds but readback is unavailable: preserve the attempted publication/request identity and classify the outcome as pending/unconfirmed rather than reissuing blindly.
- Cursor gap / retained-history loss: record the gap and use the existing recovery path; never infer that an unseen event never existed.
- Restart during any step: resume from persisted evidence/state without silently duplicating a terminal action.

## Completion evidence

Only move `PENDING_AUTONOMOUS_RUNTIME_VERIFICATION` to `VERIFIED` when inspectable evidence exists for all of the following:

- canonical DID recovered after unattended restart;
- signer challenge succeeds from the actual unattended runtime context;
- same-DID signed publication succeeds;
- publication readback verifies cryptographically;
- Gemini was invoked through the configured generator boundary for the accepted input;
- output validation ran before signing;
- cursor/state survived restart without replay/duplication;
- durable receipt/evidence exists for the cycle;
- runtime continued listening after success;
- negative tests demonstrate fail-closed behavior for signer loss, DID mismatch, invalid signature/input, duplicate/stale input, model failure and interrupted publication.

## Explicit non-goals

Do not use this closure task to:

- regenerate or rotate the canonical DID;
- replace the DPAPI/named-pipe signer architecture without a demonstrated blocker that cannot be fixed in place;
- replace Gemini with another model/provider;
- add new Router scoring features;
- create a new public agent repo;
- duplicate TCLK or Technocore clients already represented by adapters;
- hardcode provisional FLOP/Agents allocation logic;
- mark profile/mailbox/room ownership verified without their own signed write + readback evidence.

The goal is operational closure of the already-built agent, not another stack audit or redesign.
