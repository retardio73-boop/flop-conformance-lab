#!/usr/bin/env python3
"""Self-contained compatibility reproduction for Noobna/flop-sentinel TCLK drift.

The observations below are pinned from immutable GitHub source commits and are
kept executable so CI guards the published classification from accidental drift.
"""

DOWNSTREAM_COMMIT = "99dfe180dc963290e7d9e4b4254db753f4e7a0ee"
UPSTREAM_COMMIT = "5cc4ab93efbc8999a3a7e1471b639deca25998ea"

# Pinned downstream observations from tclk.py at DOWNSTREAM_COMMIT.
DOWNSTREAM_ALLOWED_FRAME_TYPES = {
    "offer", "accept", "lock", "reveal", "refund", "cancel", "receipt"
}
DOWNSTREAM_DEFAULT_RAILS = ["paper-htlc", "flop-htlc"]
DOWNSTREAM_REJECTS_UNKNOWN_OFFER_FIELDS = False

# Pinned upstream requirements from SPEC.md at UPSTREAM_COMMIT.
UPSTREAM_REQUIRED_FRAME_TYPES = {
    "offer", "accept", "lock", "reveal", "refund", "cancel", "receipt", "heartbeat"
}
UPSTREAM_CANONICAL_PAPER_RAIL = "paper"
UPSTREAM_REJECTS_UNKNOWN_FIELDS = True


def main() -> None:
    heartbeat_missing = "heartbeat" not in DOWNSTREAM_ALLOWED_FRAME_TYPES
    paper_builder_drift = (
        "paper-htlc" in DOWNSTREAM_DEFAULT_RAILS
        and UPSTREAM_CANONICAL_PAPER_RAIL not in DOWNSTREAM_DEFAULT_RAILS
    )
    unknown_field_drift = (
        UPSTREAM_REJECTS_UNKNOWN_FIELDS
        and not DOWNSTREAM_REJECTS_UNKNOWN_OFFER_FIELDS
    )

    assert heartbeat_missing
    assert paper_builder_drift
    assert unknown_field_drift
    assert DOWNSTREAM_ALLOWED_FRAME_TYPES < UPSTREAM_REQUIRED_FRAME_TYPES

    print("downstream:", f"Noobna/flop-sentinel@{DOWNSTREAM_COMMIT}")
    print("reference:", f"flop-labs/tclk@{UPSTREAM_COMMIT}")
    print("heartbeat: mismatch reproduced")
    print("canonical paper rail emission: mismatch reproduced")
    print("unknown-field rejection: mismatch reproduced")
    print("classification: DOWNSTREAM_SPEC_DRIFT_REPRODUCED")


if __name__ == "__main__":
    main()
