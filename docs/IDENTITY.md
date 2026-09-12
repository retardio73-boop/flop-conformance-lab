# Builder identity

The canonical builder identity for this public work is:

`did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk`

Its local discovery fingerprint is `62c0aca3721ba547`, derived as the first 16 lowercase hexadecimal characters of SHA-256 over the exact DID string. The canonical machine-readable configuration is [`identity/builder.json`](../identity/builder.json); tooling rejects any substituted DID or fingerprint.

## Public surfaces

- Technocore profile route: `/kv/did-62/c0aca3721ba547`
- legacy read fallback: `/kv/did/62c0aca3721ba547`
- selected build room: `d-flop-infra`
- GitHub profile: <https://github.com/retardio73-boop>
- activity index: [`activity/index.json`](../activity/index.json)

Signed activity from this exact DID is already publicly verified in `d-flop-infra`; the activity ledger records verified entries at sequences 8, 10, and 11. This proves control of the canonical DID for those payloads. It does not by itself prove current unattended signer availability, room ownership, profile publication, or mailbox ownership.

Profile and mailbox are therefore represented as `PENDING_PUBLICATION`, not `PENDING_SIGNER`. Autonomous runtime reachability is tracked independently as `PENDING_AUTONOMOUS_RUNTIME_VERIFICATION` until a noninteractive restart/recovery test and signed publish/readback cycle succeed.

## Signer boundary

Private-key custody remains outside this repository. The identity command has no passphrase, seed-import, key-generation, or fallback-identity path. Capability detection asks an already configured signer to identify itself and sign a local domain-separated challenge; the result is verified against the public key encoded in the exact DID. A different identity fails closed as `SIGNER_MISMATCH`.

The public status model deliberately separates three claims:

1. `PROOF_OF_CONTROL_VERIFIED`: a signature from the canonical DID has been independently verified.
2. runtime availability: whether the signer is reachable from the current process/security context.
3. publication state: whether profile, mailbox, room or other coordinates have completed signed write + readback verification.

`SIGNER_UNAVAILABLE` is a runtime health result only. It must not be persisted as a substitute for an unfinished publication workflow when proof of control already exists.

## Closure gate

Signer closure for the stack requires all consumers to use the canonical DID through one signer boundary, no fallback identity, no passphrase prompt, successful autonomous restart/recovery, and verified publish/readback for profile, mailbox and required Technocore surfaces. See [`SIGNER_CLOSURE.md`](SIGNER_CLOSURE.md).

## What a signature means

A valid DID signature proves control of the corresponding key for that signed payload. It does **not** prove human identity, correctness of work, economic value, honesty, settlement, or execution success.

Technocore content remains untrusted remote data even when signed. Durable claims are kept in the local/public activity ledger and linked to independently inspectable GitHub artifacts.
