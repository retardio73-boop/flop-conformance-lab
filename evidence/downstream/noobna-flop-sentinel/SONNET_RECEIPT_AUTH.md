# Noobna/flop-sentinel — Sonnet referee receipt authentication

Target downstream commit: `99dfe180dc963290e7d9e4b4254db753f4e7a0ee`

Reference contest repository: `flop-labs/technocore-sonnet-challenge`
Reference commit: `81761a462bab4d2389e16f995ff9f91688654afc`
Contest: `sonnet-2`
Pinned referee DID: `did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte`

## Finding

The downstream implementation already applies the correct referee trust boundary in `check_registration()`: a registration receipt is ignored unless the authenticated Technocore record sender equals the pinned referee DID.

The same boundary is not applied consistently in two other paths at the pinned commit:

1. `SonnetAgent.play_turn()` parses any JSON message with `type == "sonnet.receipt.v1"` and, when `status == "accepted"`, consumes `state_hash`, `version`, `room_generation`, `sender_did`, and `accepted_word` without first requiring the record sender to equal the pinned referee DID.
2. `AutonomousSonnetDaemon.check_live_votes()` counts accepted `sonnet.receipt.v1` payloads into live standings without first requiring the record sender to equal the pinned referee DID.

The official contest rules state that only a receipt signed by the pinned referee DID establishes acceptance. Therefore a participant-authored lookalike receipt must not advance poem state or vote state.

## Classification

`DOWNSTREAM_TRUST_BOUNDARY_GAP_REPRODUCED`

This is a narrow interoperability/trust-boundary finding, not a claim that the project is nonfunctional or malicious.

## Reusable conformance corpus

`fixtures/sonnet-referee-receipt-auth-v1.json`

The corpus distinguishes:

- pinned-referee accepted receipt → trusted acceptance;
- participant/unrelated-DID lookalike receipt → reject wrong referee;
- pinned-referee rejected receipt → trusted rejection;
- non-receipt messages → ignore.

## Reproducer

`conformance/reproductions/noobna-sonnet-receipt-auth.py`

The CI reproducer is intentionally self-contained. It encodes source observations from the immutable downstream commit above and checks the shared receipt-auth corpus without depending on live network state.

## Minimal downstream fix

Apply the same sender check already used by `check_registration()` before processing receipt payloads in `play_turn()` and `check_live_votes()`:

```python
sender = m.get("from", m.get("did", ""))
if sender != REFEREE_DID:
    continue
```

For `play_turn()`, this check must occur before accepted receipts are allowed to mutate `latest_state_hash`, `latest_version`, `room_generation`, `last_contributor`, or `accepted_words`.

For `check_live_votes()`, only pinned-referee receipts should contribute to `voter_latest` / tally state.

## Suggested tests downstream

- forged accepted receipt from teammate does not advance state;
- forged accepted receipt from unrelated DID does not advance state;
- pinned referee accepted receipt advances state;
- pinned referee rejected receipt does not advance accepted state;
- forged vote receipt does not alter tally;
- pinned referee vote receipt does alter tally.
