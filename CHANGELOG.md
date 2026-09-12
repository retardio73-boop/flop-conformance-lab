# Changelog

## 0.1.4-alpha - 2026-09-11

- Add the public `quote -> open_channel -> receipt` boundary fixture motivated by Yellow Paper issue #26; unspecified quote/discovery and pay-unit mappings remain explicitly fail-closed.
- Add an independent reproduction fixture for Yellow Paper issue #44 (`wrong_path_orientation`) with a control mutation showing where Merkle orientation is semantically significant.
- Keep the Lab focused on cross-system boundaries: released TCLK, Technocore signed transport, signing/canonicalization, Router behavior and FLOP target semantics rather than duplicating generic Technocore conformance coverage.
- Remove live Sonnet scouting state from the public main branch and sanitize local-path provenance metadata.

## 0.1.3-alpha - 2026-09-08

- Separate release, pinned-upstream, target-spec, and live conformance lanes.
- Keep FLOP E.51 wire closure explicitly unresolved and public runtime conformance unavailable.
- Add a non-authoritative differential adapter seam without copying community implementations.

## 0.1.2-alpha - 2026-09-08

- Include all pinned runtime dependency tarballs in the clean-package offline smoke test so a cold CI cache cannot trigger registry access.

## 0.1.1-alpha - 2026-09-08

- Make clean-package smoke tests deterministic and offline by installing the lockfile-pinned local TCLK tarball alongside the Lab tarball.

## 0.1.0-alpha - 2026-09-08

- Initial cross-system TCLK, Technocore, signing, Router and FLOP target-spec lanes, including normative-field ID regression coverage.
