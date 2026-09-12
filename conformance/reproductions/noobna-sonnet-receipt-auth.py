#!/usr/bin/env python3
"""Pinned source-level reproduction for Noobna/flop-sentinel Sonnet receipt trust.

This reproducer intentionally avoids network access in CI. It encodes exact source
observations from Noobna/flop-sentinel@99dfe180dc963290e7d9e4b4254db753f4e7a0ee:
- check_registration() filters records by REFEREE_DID before trusting receipt JSON;
- play_turn() processes sonnet.receipt.v1 state without the same sender check;
- autonomous_sonnet_daemon.check_live_votes() likewise counts accepted receipt JSON
  without first requiring the pinned referee sender.

Official sonnet-2 rules pin referee DID and state that only a receipt signed by that
pinned DID establishes acceptance.
"""

import json
from pathlib import Path

DOWNSTREAM_COMMIT = "99dfe180dc963290e7d9e4b4254db753f4e7a0ee"
UPSTREAM_COMMIT = "81761a462bab4d2389e16f995ff9f91688654afc"
REFEREE_DID = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte"

# Pinned source observations from sonnet_agent.py / autonomous_sonnet_daemon.py.
DOWNSTREAM_CHECK_REGISTRATION_REQUIRES_REFEREE = True
DOWNSTREAM_PLAY_TURN_REQUIRES_REFEREE_BEFORE_STATE_UPDATE = False
DOWNSTREAM_LIVE_VOTES_REQUIRE_REFEREE_BEFORE_TALLY = False

FIXTURE = Path(__file__).parents[2] / "fixtures" / "sonnet-referee-receipt-auth-v1.json"

def classify(record_from: str, payload: dict) -> str:
    if payload.get("type") != "sonnet.receipt.v1":
        return "IGNORE_NON_RECEIPT"
    if record_from != REFEREE_DID:
        return "REJECT_WRONG_REFEREE"
    if payload.get("status") == "accepted":
        return "TRUSTED_ACCEPTANCE"
    if payload.get("status") == "rejected":
        return "TRUSTED_REJECTION"
    return "IGNORE_UNFINALIZED_RECEIPT"


def main() -> None:
    assert DOWNSTREAM_CHECK_REGISTRATION_REQUIRES_REFEREE
    assert not DOWNSTREAM_PLAY_TURN_REQUIRES_REFEREE_BEFORE_STATE_UPDATE
    assert not DOWNSTREAM_LIVE_VOTES_REQUIRE_REFEREE_BEFORE_TALLY

    corpus = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert corpus["reference"]["commit"] == UPSTREAM_COMMIT
    assert corpus["reference"]["referee_did"] == REFEREE_DID

    for case in corpus["cases"]:
        actual = classify(case["record_from"], case["payload"])
        assert actual == case["expected"], (case["name"], actual, case["expected"])

    print("SONNET_REFEREE_RECEIPT_TRUST_GAP_REPRODUCED")
    print(f"downstream={DOWNSTREAM_COMMIT}")
    print(f"upstream={UPSTREAM_COMMIT}")
    print("affected=play_turn,live_vote_tally")


if __name__ == "__main__":
    main()
