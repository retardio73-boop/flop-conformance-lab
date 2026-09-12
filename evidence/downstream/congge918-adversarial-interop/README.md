# Downstream adversarial evidence interop — congge918 tools

This note applies `adversarial-evidence-suite-v1` to two independent read-only TCLK tools by source inspection at pinned commits. It is not a live execution claim and it does not classify ordinary upstream-version drift as a defect.

## Targets

- `congge918/technocore-tclk-inspector@2d5415c3ce56fc94e195733106d300b85b58b376`
- `congge918/technocore-tclk-deal-scout@f8972ef29f5abc6fd0ea58033f166de216860343`

## Technocore TCLK Inspector

Overall: **PARTIAL — real trust boundaries are present, but two evidence-layer gaps remain.**

### PASS

- Technocore transport signature is verified before state advancement.
- Decoded `frame.from` must equal the authenticated record sender.
- Detached `tclk1 ...` text without signed transport metadata is explicitly prevented from advancing state.
- `paper` is labelled `NO VALUE`.
- Non-paper rails are labelled `UNVERIFIED` and the tool tells the reader to verify the value rail independently.

### GAP — lossless transport nonce

`parseInput()` performs `JSON.parse(line)` before `transcriptRecord(...)`. A 19-digit Technocore transport nonce represented as a JSON number may therefore exceed JavaScript's safe-integer range and lose the exact digits before signature reconstruction.

This maps to fixture case:

- `transport-nonce-19-digit-number`

This is an inspector integration issue, not merely an old vendored TCLK release: once the raw decimal token has been rounded by `JSON.parse`, a downstream verifier cannot reconstruct the exact `room|nonce|text` preimage.

### GAP — evidence completeness/order classification

Authenticated records are folded in caller-supplied input order. The inspector does not independently classify per-room sequence gaps, non-monotonic ordering, or a transcript as incomplete evidence.

This maps to:

- `gapped-signed-transcript`
- `reordered-signed-transcript`
- `TIME_UNAUTHENTICATED`
- `OUTCOME_PROVISIONAL`

The existing settlement warning is good; the missing piece is an explicit evidence-quality verdict before presenting a replayed terminal state.

### Minimal downstream improvement

- Preserve the raw top-level transport nonce as decimal text before `JSON.parse`.
- Track per-room sequence monotonicity and gaps.
- Surface evidence labels independently from TCLK state.
- Preserve current rail-settlement warnings unchanged.

## Technocore TCLK Deal Scout

Overall: **STRONG PARTIAL / near-PASS for the current suite.**

### PASS

- `parseLosslessJson()` protects 1–19 digit nonce tokens before `JSON.parse`.
- Transport signatures are verified before frame use.
- `frame.from` must match the signed DID.
- Candidate detail filtering rejects records naming a different contract.
- Window/export readers record source gaps.
- Timestamp trust is explicitly reported as `UNSIGNED_PROVISIONAL` for files or `VENUE_OBSERVED_UNSIGNED` for live observations.
- Reports explicitly state that Technocore `seq` and `ts` are server-assigned and not covered by the DID signature.
- `paper` is `NO_VALUE`.
- Other rails are `VALUE_UNVERIFIED` and require independent rail verification.
- Counterparty history is labelled bounded evidence rather than a reputation score.

### Remaining GAP — reordered input is not explicitly classified

`sequenceGaps(records)` detects a forward missing range when `current.seq > previous.seq + 1`, but it does not flag a non-monotonic sequence such as `2,1` as reordered. `parseRoomExport()` preserves supplied record order before folding.

This maps specifically to:

- `reordered-signed-transcript`

The smallest improvement is an `ordered` / `nonMonotonic` check beside the existing gap detector and a report limitation when it is false.

## Why this evidence is useful

These two tools demonstrate why the Lab should publish both positive and negative results. Neither project is being marked "broken" because it vendors an earlier TCLK commit. The classification only covers trust boundaries that exist in the integration itself:

- Inspector already gets authentication and settlement separation right, but loses large nonce digits and lacks transcript completeness/order evidence.
- Deal Scout already implements most of the new suite independently, including the two unusually important boundaries: lossless nonce parsing and explicit separation of transcript state from settlement proof.

## Publication boundary

The GitHub connection used for this audit has read-only access to both external repositories. An attempt to create an upstream issue was rejected by GitHub with `403 Resource not accessible by integration`. No upstream issue or PR is claimed.
