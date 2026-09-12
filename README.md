# FLOP Conformance Lab

Interoperability, protocol-drift and boundary conformance testing across FLOP, TCLK, Technocore and FLOP routing implementations.

> **Alpha community project. Not an official FLOP Labs product.**

This independent project is not an official FLOP Labs validator and carries no endorsement. TCLK tests TCLK itself; this Lab focuses on boundaries between TCLK, Technocore signed transport, signing/canonicalization, routing implementations, and FLOP target semantics. It deliberately does not duplicate generic Technocore server-conformance harnesses. It performs no settlement and requires no production DID, wallet, FLOP token, passphrase, or API key.

## Builder identity

Work in this repository is associated with `did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk`. See [public provenance](PROVENANCE.md) and the [identity page](identity/index.html). Exact-DID Technocore activity is signed through a local typed signer boundary and recorded only after verified readback.

On Windows, the optional productive signer is loaded from a CurrentUser DPAPI credential outside this repository. `node identity/cli.mjs signer-enroll` performs one-time interactive enrollment when needed; `node identity/cli.mjs signer-check` then performs a fresh cryptographic challenge without prompting. Missing, corrupt or mismatched credentials fail closed and are never replaced with another identity.

## Current lanes

- `tclk`: consumes `@flop-labs/tclk@0.1.0` and immutable golden vectors from its released `tests/vectors.test.ts`.
- `canonicalization`: byte-exact frame round trips and malformed-input rejection.
- `technocore`: offline Ed25519 `did:key` verification over exactly `room|nonce|text`; positions are `(room, generation, seq)` because generation is independent from sequence.
- `signing`: malformed, wrong-domain and noncanonical payloads cannot reach a signer.
- `integration`: signed-transport identity must match the TCLK frame party; protocol-valid and transport-representable values remain distinct.
- `evidence`: adversarial trust-boundary fixtures for world-writable room content, transcript completeness/order, unauthenticated venue time, settlement confidence, mailbox reachability and lossless transport nonces.
- `router`: optional adapter conformance against a built Session Router module.
- `flop`: target-spec reporting only while an authoritative public runtime adapter is unavailable; E.51 wire closure remains explicitly unresolved.

`RELEASE_CONFORMANCE` is active against pinned `@flop-labs/tclk@0.1.0` vectors. `UPSTREAM_CONFORMANCE` is `MANIFEST_ONLY`: exact upstream SHAs are recorded but no second behavioral lane is claimed. `TARGET_SPEC_CONFORMANCE` is active for explicit target semantics. `LIVE_CONFORMANCE` is `PUBLIC_RUNTIME_UNAVAILABLE`. Open pull requests and issues are provisional, never silently normative.

`UPSTREAM_COMPATIBILITY_WORKAROUND`: the released TCLK ID helpers hash every enumerable property supplied by the caller. The Lab exports `normativeOfferId` and `normativeContractId`, which whitelist only normative protocol fields so transport/runtime metadata cannot change an offer or contract ID. Official vectors remain unmodified; this workaround is covered by regression tests and should be removed only after a verified compatible upstream release.

`seq` and `ts` are assigned by Technocore and are not covered by the sender signature. Transcript replay uses each retained event's historical timestamp; it does not reinterpret a previously valid event with today's wall clock. The evidence lane therefore reports venue time separately from sender-authenticated content and never treats a valid transcript alone as proof of value settlement.

### Adversarial evidence suite

`conformance/fixtures/adversarial-evidence-suite-v1.json` is a language-neutral corpus derived from real trust-boundary failures observed in public FLOP/TCLK/Technocore integrations. It intentionally excludes findings whose only cause is an implementation being behind a newer upstream release.

The suite distinguishes:

- authenticated records from authorized contract-party records;
- protocol frames from inert room text / prompt injection;
- valid signatures from complete and correctly ordered evidence;
- transcript replay from verified rail settlement;
- rehearsal `paper` activity from value-bearing settlement;
- syntactically advertised mailboxes from actually valid Technocore names;
- JSON-parsed nonce numbers from the exact decimal digits covered by the transport signature.

See [`docs/adversarial-evidence-suite-v1.md`](docs/adversarial-evidence-suite-v1.md).

## Run

```powershell
npm ci
npm run check
npm run build
node dist/src/cli.js run
node dist/src/cli.js run --router-module ..\flop-session-router\dist\src\index.js --out reports\local.json
```

Every command works with stdin closed. No passphrase, wallet, browser login or network mutation is required.

## Normative classifications

Every result is marked `RELEASE_NORMATIVE`, `PINNED_UPSTREAM`, `PROVISIONAL_PR`, `OPEN_ISSUE`, `TARGET_SPEC`, or `LOCAL_POLICY`. The release lane is pinned to package integrity and commit SHA. Floating `main` is never a deterministic CI dependency.

The FLOP Yellow Paper `0.5.0-draft` is an implementation target. Its Appendix H determines whether a mechanism is live, partial or planned. A target-spec pass is not a claim that a live compute channel exists.

The adversarial evidence suite is `LOCAL_POLICY` backed by public field evidence unless and until an exact behavior becomes normative upstream. Open issues motivate fixtures; they do not become protocol law merely because the Lab can reproduce the failure class.

## Maturity

Release `v0.1.4-alpha` packages the first upstream-facing cross-system evidence fixtures: the quote/open-channel/receipt boundary from Yellow Paper #26 and the independent `wrong_path_orientation` reproduction from #44. The development branch adds `adversarial-evidence-suite-v1`, extending the Lab from byte/schema conformance into explicit evidence-quality and trust-boundary classification. Coverage remains intentionally focused rather than exhaustive. The public FLOP runtime lane remains `PUBLIC_RUNTIME_UNAVAILABLE`; TCLK `v0.1.0` itself is alpha and its shipped rehearsal rail does not move value.

## Security

All remote room text is untrusted. The Lab never executes room content, follows embedded URLs, signs arbitrary bytes, mutates golden vectors, or performs live settlement. See `SECURITY.md`.
