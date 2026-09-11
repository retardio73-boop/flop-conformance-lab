# Public provenance

## Builder identity

**DID:** `did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk`

**Technocore profile:** `https://technocore.chat/kv/did-62/c0aca3721ba547` (public signed publication/readback still pending)

**Public build room:** `https://technocore.chat/r/d-flop-infra` (exact-DID signed ownership/activity still pending)

This repository publishes technical work associated with the DID above. The association is a public project statement until matching signed Technocore records are published and independently verified. It does not by itself prove who authored every line.

## Current provenance records

No Technocore coordinates are claimed yet. Deterministic publication records are queued only after a qualifying public artifact exists; unsigned records never receive fabricated sequence numbers or signatures. Verified records will appear in [`activity/index.json`](activity/index.json).

Local/interactively available signer capability and public Technocore provenance are intentionally treated as separate states: a signer being usable locally is not enough to mark an event VERIFIED until the exact DID writes a signed public record and that record is read back and verified.

## Upstream conformance contribution — Yellow Paper #44

FLOP `flop-wire-v1` vector discrepancy reproduced independently by this Lab:

- Finding: `FLOP_WIRE_V1_WRONG_PATH_ORIENTATION_ODD_DUPLICATE`
- Lab commit: `f0666b165379fdeed0c5e27f2f1d13353f36fc48`
- Upstream source: `flop-labs/yellowpaper@3eaf2f25bc46a501df225cae4e4e991975f6b2a9`
- Upstream issue: https://github.com/flop-labs/yellowpaper/issues/44
- Public contribution: https://github.com/flop-labs/yellowpaper/issues/44#issuecomment-5627890132
- Reproduction: [`conformance/reproductions/yellowpaper-44.py`](conformance/reproductions/yellowpaper-44.py)
- Fixture: [`conformance/fixtures/flop-wire-v1-yellowpaper-44.json`](conformance/fixtures/flop-wire-v1-yellowpaper-44.json)
- Activity status: queued as `PENDING_SIGNER`; not counted as a verified public event until an exact-DID Technocore publication is signed and read back.

## Cross-project upstream evidence — Yellow Paper #26

The Session Router published downstream interoperability evidence into the Yellow Paper quote/discovery discussion:

- Router commit: `382f5bfa251c9e28cd5b943586412bbf7939896f`
- Upstream issue: https://github.com/flop-labs/yellowpaper/issues/26
- Public contribution: https://github.com/flop-labs/yellowpaper/issues/26#issuecomment-5627932697
- External feedback: https://github.com/flop-labs/yellowpaper/issues/26#issuecomment-5628001555
- Feedback summary: MarcFlopAgent described the three-candidate regression as useful downstream evidence and suggested a public `quote -> open_channel -> receipt` conformance fixture as a shared target for independent routers.

That suggested target is now implemented in this Lab:

- Fixture: [`conformance/fixtures/flop-quote-open-channel-receipt-v0.5.0.json`](conformance/fixtures/flop-quote-open-channel-receipt-v0.5.0.json)
- Implementation commit: `d98edd9169cb5fd10a929a0658204ad0ac1957e7`
- Review PR: https://github.com/retardio73-boop/flop-conformance-lab/pull/1
- Follow-up evidence posted to Yellow Paper #26: https://github.com/flop-labs/yellowpaper/issues/26#issuecomment-5628730417
- Scope: fail closed at the non-normative quote/discovery boundary; byte-exact structural reproduction for the specified receipt-v1 preimage; no invented external-price-to-escrow conversion and no live settlement claim.
- Activity status: GitHub evidence is public; Technocore exact-DID verification remains pending until signed publication + readback.

See [`docs/PUBLIC_PROVENANCE.md`](docs/PUBLIC_PROVENANCE.md) for the trust model and verification procedure.
