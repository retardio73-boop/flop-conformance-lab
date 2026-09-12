#!/usr/bin/env python3
"""Reproduce current TCLK compatibility drift in Noobna/flop-sentinel.

Pins upstream/downstream by immutable Git commit SHA and executes only the
minimal downstream functions needed for the checks.
"""

from __future__ import annotations

import ast
import urllib.request

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
    request = urllib.request.Request(url, headers={"User-Agent": "flop-conformance-lab/0.1"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def load_minimal_downstream(source: str) -> dict[str, object]:
    tree = ast.parse(source, filename="Noobna/flop-sentinel:tclk.py")
    wanted_functions = {"canonical_json", "offer_id", "validate_frame", "make_offer"}
    body: list[ast.stmt] = []

    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            body.append(node)
        elif isinstance(node, ast.Assign):
            names = [target.id for target in node.targets if isinstance(target, ast.Name)]
            if any(name.isupper() or name.endswith("_RE") for name in names):
                body.append(node)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id.isupper() or node.target.id.endswith("_RE"):
                body.append(node)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in wanted_functions:
            body.append(node)

    found = {node.name for node in body if isinstance(node, ast.FunctionDef)}
    assert wanted_functions <= found, f"missing downstream functions: {wanted_functions - found}"

    namespace: dict[str, object] = {}
    minimal = ast.fix_missing_locations(ast.Module(body=body, type_ignores=[]))
    exec(compile(minimal, "downstream-tclk-minimal", "exec"), namespace)
    return namespace


def assert_upstream_contract(spec_text: str) -> None:
    assert "| `heartbeat` |" in spec_text
    assert "`paper` is the canonical spelling" in spec_text
    assert "known frame type with an unknown key" in spec_text


def reproduce_heartbeat(ns: dict[str, object]) -> None:
    validate_frame = ns["validate_frame"]
    frame = {
        "type": "heartbeat",
        "from": VALID_DID,
        "contract": "0x" + ("a" * 64),
        "nonce": "0123456789abcdef",
    }
    try:
        validate_frame(frame)
    except ValueError as exc:
        assert "Unknown frame type" in str(exc)
        return
    raise AssertionError("downstream unexpectedly accepted current heartbeat frame")


def reproduce_default_rail(ns: dict[str, object]) -> None:
    make_offer = ns["make_offer"]
    offer = make_offer(
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


def reproduce_unknown_field(ns: dict[str, object]) -> None:
    make_offer = ns["make_offer"]
    offer_id = ns["offer_id"]
    validate_frame = ns["validate_frame"]
    offer = make_offer(
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
    offer["id"] = offer_id(offer)
    validate_frame(offer)


def main() -> None:
    upstream = fetch(UPSTREAM_SPEC_URL)
    downstream = fetch(DOWNSTREAM_URL)
    assert_upstream_contract(upstream)
    namespace = load_minimal_downstream(downstream)

    reproduce_heartbeat(namespace)
    reproduce_default_rail(namespace)
    reproduce_unknown_field(namespace)

    print("downstream:", f"Noobna/flop-sentinel@{DOWNSTREAM_COMMIT}")
    print("reference:", f"flop-labs/tclk@{UPSTREAM_COMMIT}")
    print("heartbeat: mismatch reproduced")
    print("canonical paper rail emission: mismatch reproduced")
    print("unknown-field rejection: mismatch reproduced")
    print("classification: DOWNSTREAM_SPEC_DRIFT_REPRODUCED")


if __name__ == "__main__":
    main()
