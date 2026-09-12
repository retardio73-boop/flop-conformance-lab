# Noobna/flop-sentinel downstream TCLK verification

Target: `Noobna/flop-sentinel` at commit `99dfe180dc963290e7d9e4b4254db753f4e7a0ee`.
Reference: `flop-labs/tclk` at commit `5cc4ab93efbc8999a3a7e1471b639deca25998ea`.

This evidence is an independent downstream compatibility check. It does not assess the Sentinel UI, threat engine, Sonnet agent, or smart-contract security. It checks only observable `tclk/1` wire/builder behavior against the pinned current TCLK specification.

## Reproduced mismatches

1. **Heartbeat frame support** — current TCLK defines `heartbeat` as a first-class frame usable in `accepted`/`locked`; the pinned downstream validator rejects it as an unknown frame type.
2. **Canonical rehearsal rail emission** — current builders must normalize the rehearsal rail to canonical id `paper`; the pinned downstream `make_offer()` default emits `paper-htlc`, which is not a registered canonical rail id.
3. **Unknown-field rejection** — current TCLK decoding is fail-closed for known frame types with unknown keys; the pinned downstream validator accepts an `offer` carrying an extra unknown field when its id is recomputed over that field.

Run:

```bash
python3 conformance/reproductions/noobna-flop-sentinel-tclk.py
```

The reproducer is self-contained and encodes source observations taken from the immutable commits above. CI asserts the published mismatch classification on every push/PR; the pinned commits remain the source evidence for independent reinspection.

## Classification

`DOWNSTREAM_SPEC_DRIFT_REPRODUCED`

These results are compatibility findings, not allegations of bad faith or a claim that the whole project is non-functional. The downstream implementation appears to target an earlier TCLK surface and can be brought current by adding heartbeat semantics, builder rail normalization/registry enforcement, and schema-owned unknown-field rejection.
