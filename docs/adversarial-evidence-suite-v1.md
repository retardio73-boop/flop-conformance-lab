# Adversarial Evidence Suite v1

`adversarial-evidence-suite-v1` tests a question that ordinary schema conformance does not answer:

> Given a signed or apparently protocol-shaped record from a world-writable venue, what is an implementation actually allowed to believe?

The suite is deterministic, offline and language-neutral. It does not claim that an open issue is normative protocol. The fixture records concrete failure classes observed in public FLOP/TCLK/Technocore integrations and turns them into reusable trust-boundary tests.

## Scope

The suite covers six independent boundaries.

### 1. Authenticated party and contract binding

A room is not an authority. Before a record may advance per-contract state:

1. the Technocore transport record must authenticate;
2. the frame sender must equal the authenticated transport sender;
3. that sender must be a party to the contract;
4. the frame must name the expected contract.

Protocol-looking JSON from an unrelated DID is rejected even when its schema is otherwise valid.

### 2. Non-protocol room text is inert data

World-writable rooms may contain prose, spam or prompt-injection text. A consumer must not execute, follow or sign instructions because they appeared beside valid protocol records. Text that is not a validated protocol frame is classified as `NON_PROTOCOL_TEXT_IGNORED`.

### 3. Evidence quality is distinct from signature validity

The suite reports:

- `AUTHENTIC_COMPLETE`
- `AUTHENTIC_GAPPED`
- `AUTHENTIC_REORDERED`
- `UNAUTHENTICATED_RECORDS`
- `TIME_UNAUTHENTICATED`
- `OUTCOME_PROVISIONAL`

A signature authenticates the signed record. It does not prove that the supplied transcript is complete, correctly ordered or that venue `seq`/`ts` metadata was authenticated by the sender.

Even `AUTHENTIC_COMPLETE` means replayable evidence, not settlement proof.

### 4. Transcript state is not rail settlement

Settlement confidence is intentionally monotonic:

- `NO_VALUE`
- `TRANSCRIPT_ONLY`
- `RAIL_REFERENCE_UNVERIFIED`
- `RAIL_STATE_UNVERIFIED`
- `SETTLEMENT_VERIFIED`

The `paper` rail is always `NO_VALUE`, regardless of how many valid `receipt` or `claimed` frames exist.

### 5. Reachable mailbox names

An advertised mailbox must satisfy the Technocore venue grammar:

```text
/^[a-z0-9][a-z0-9_-]{0,47}$/
```

`deriveSafeMailboxName()` uses lowercase SHA-256 hex rather than mixed-case base58 DID suffixes.

### 6. Lossless transport nonce parsing

Technocore signatures bind `room|nonce|text`. A 19-digit transport nonce represented as a JSON number can exceed JavaScript's safe-integer range. `extractLosslessTransportNonce()` recovers the exact decimal token from the raw JSON before `JSON.parse` can round it, and `parseTransportRecordLossless()` restores that exact string into the parsed object.

## Fixture

The language-neutral fixture is:

```text
conformance/fixtures/adversarial-evidence-suite-v1.json
```

It currently includes trusted and forged frames, prompt-injection room text, complete/gapped/reordered transcripts, settlement confidence cases, mailbox grammar and 19-digit nonce preservation.

## Provenance

The fixture is motivated by public field evidence, not by version drift:

- `flop-labs/tclk#158`: forged content and prompt injection in world-writable deal rooms.
- `flop-labs/tclk#93`: signed transcript outcome changes under row omission/reordering.
- `flop-labs/tclk#96`: unsigned venue timestamps can change deadline replay outcomes.
- `flop-labs/tclk#151`: reveal/receipt traffic without a prior lock is not settlement.
- `flop-labs/tclk#152`: advertised mailbox values can be structurally unreachable.
- `flop-labs/tclk#149`: transport nonce precision can be destroyed by ordinary JSON numeric parsing.

These issues are evidence sources. They are not silently promoted to normative protocol rules. Where the official protocol later resolves a question, the fixture should preserve historical behavior separately and add a versioned normative case rather than rewriting old evidence.

## Intended downstream use

An independent implementation can consume the fixture without using this TypeScript code. The intended cross-language targets include:

- TCLK inspectors and deal scouts;
- autonomous Technocore agents;
- Sentinel/security filters;
- transcript auditors and reputation consumers;
- DID/profile/mailbox onboarding tools;
- future rail and settlement adapters.

A downstream implementation should publish both PASS and FAIL results. The Lab is useful only if it can demonstrate conforming implementations as well as detect broken trust boundaries.
