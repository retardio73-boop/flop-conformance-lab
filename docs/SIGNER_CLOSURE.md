# Signer closure gate

This document defines the completion criteria for canonical identity/signing across the FLOP / Technocore stack.

Canonical DID:

`did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk`

## Status semantics

- `PROOF_OF_CONTROL_VERIFIED`: at least one signature from the canonical DID has been independently verified.
- `SIGNER_AVAILABLE`: the signer is reachable in the current runtime context and passes a domain-separated challenge.
- `SIGNER_UNAVAILABLE`: runtime health failure only; it is not a durable workflow state.
- `PENDING_PUBLICATION`: the artifact/coordinate still requires signed write + readback verification.
- `PENDING_AUTONOMOUS_RUNTIME_VERIFICATION`: unattended startup/restart reachability has not yet been proven.
- `VERIFIED`: the relevant signed artifact or write has been read back and cryptographically verified.

## Required consumers

The closure gate covers the shared signer boundary used by:

- Technocore identity/profile publication
- build-room publication
- mailbox publication and responder runtime
- observer / Probe v1
- FLOP Session Router
- Cross-System Conformance Lab
- TCLK signing/transport adapter
- contest tooling that requires the canonical identity

No consumer may create or silently substitute another DID.

## Acceptance gate

All of the following must be true in steady state:

- canonical DID matches exactly;
- proof-of-control verifies locally;
- signer is reachable from the unattended runtime security context;
- no passphrase prompt is required;
- no fallback identity/key-generation path is exercised;
- Router signing succeeds and verifies against the canonical identity;
- Conformance/TCLK signing succeeds and verifies against the canonical identity;
- Probe/observer signed publication succeeds;
- profile signed write + readback is verified;
- build-room signed write + readback is verified;
- mailbox signed write + readback is verified;
- restart/recovery restores the same DID, signer access, observer cursor and signed publishing without human intervention;
- negative tests fail closed for signer loss, identity mismatch, invalid signature, stale/duplicate input and interrupted publication;
- durable public state contains no stale `PENDING_SIGNER` or stale `SIGNER_UNAVAILABLE` values.

## Evidence rule

A status may move to `VERIFIED` only from inspectable evidence: signature verification, public readback, local deterministic verification, or CI/test output. Status files must not be manually promoted merely to reflect expected runtime state.

## Existing evidence

The public activity ledger already contains verified signed activity from the canonical DID in `d-flop-infra`. This establishes proof of control. Autonomous runtime availability, profile publication, mailbox publication and any unverified ownership claims remain separate gates until their own evidence exists.
