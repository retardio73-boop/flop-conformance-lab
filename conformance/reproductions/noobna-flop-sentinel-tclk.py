#!/usr/bin/env python3
"""Reproduce current TCLK compatibility drift in Noobna/flop-sentinel.

Pins both upstream and downstream by immutable Git commit SHA.
Uses only the Python standard library.
"""

from __future__ import annotations

import importlib.util
import tempfile
import urllib.request
from pathlib import Path

DOWNSTREAM_COMMIT = "99dfe180dc963290e7d9e4b4254db753f4e7a0ee"
UPSTREAM_COMMIT = "5cc4ab93efbc8999a3a7e1471b639deca25998ea"
DOWNSTREAM_URL = (
    "https://raw.githubusercontent.com/Noobna/flop-sentinel/"
    f"{DOWNSTREAM_COMMIT}/tclk.py"
)
UPSTREAM_SPEC_URL = (
    "https://raw.githubusercontent.com/flop-labs/tclk/"
    f"{UPSTREAM_COMMIT}/SPEC.md"
)

VALID_DID = "did:key:z6Mk" + ("1" * 44)


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8")


def load_downstream(source: str):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "tclk_downstream.py"
        path.write_text(source, encoding="utf-8")
        spec = importlib.util.spec_from_file_location("tclk_downstream", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


def assert_upstream_contract(spec_text: str) -> None:
    assert "| `heartbeat` |" in spec_text
    assert "`paper` is the canonical spelling" in spec_text
    assert "known frame type with an unknown key" in spec_text


def reproduce_heartbeat(module) -> None:
    frame = {
        "type": "heartbeat",
        "from": VALID_DID,
        "contract": "0x" + ("a" * 64),
        "nonce": "0123456789abcdef",
    }
    try:
        module.validate_frame(frame)
    except ValueError as exc:
        assert "Unknown frame type" in str(exc)
        return
    raise AssertionError("downstream unexpectedly accepted current heartbeat frame")


def reproduce_default_rail(module) -> None:
    offer = module.make_offer(
        from_did=VALID_DID,
        role="payer",
        amount="1",
        asset="FLOP",
        claim_by_ms=2_000_000_000_000,
        refund_after_ms=2_000_000_100_000,
        expires_ms=1_999_999_900_000,
        nonce="0123456789abcdef",
    )
    assert "paper-htlc" in offer["rails"]
    assert "paper" not in offer["rails"]


def reproduce_unknown_field(module) -> None:
    offer = module.make_offer(
        from_did=VALID_DID,
        role="payer",
        amount="1",
        asset="FLOP",
        rails=["flop-htlc"],
        claim_by_ms=2_000_000_000_000,
        refund_after_ms=2_000_000_100_000,
        expires_ms=1_999_999_900_000,
        nonce="fedcba9876543210",
    )
    offer["unexpectedField"] = "accepted-by-downstream"
    offer["id"] = module.offer_id(offer)
    module.validate_frame(offer)


def main() -> None:
    upstream = fetch(UPSTREAM_SPEC_URL)
    downstream = fetch(DOWNSTREAM_URL)
    assert_upstream_contract(upstream)
    module = load_downstream(downstream)

    reproduce_heartbeat(module)
    reproduce_default_rail(module)
    reproduce_unknown_field(module)

    print("downstream:", f"Noobna/flop-sentinel@{DOWNSTREAM_COMMIT}")
    print("reference:", f"flop-labs/tclk@{UPSTREAM_COMMIT}")
    print("heartbeat: mismatch reproduced")
    print("canonical paper rail emission: mismatch reproduced")
    print("unknown-field rejection: mismatch reproduced")
    print("classification: DOWNSTREAM_SPEC_DRIFT_REPRODUCED")


if __name__ == "__main__":
    main()
