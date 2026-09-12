# Publication status

This file distinguishes repository/package state from GitHub Release state so public documentation does not imply that an unpublished artifact already exists.

## Current repository state

- Package metadata: `0.1.4`
- README / release notes describe the `v0.1.4-alpha` code state currently present on `main`.
- The latest GitHub Release currently published is `v0.1.3-alpha`.

Therefore `v0.1.4-alpha` must be treated as **implemented repository/package state pending GitHub Release publication**, not as an already-published downloadable release, until a matching tag/release and artifacts/checksums exist.

## Publication acceptance gate

A version may be described as a published GitHub Release only after all of the following exist for the same immutable commit:

- package version;
- report version generated from the same package metadata;
- passing CI/check suite;
- release tag;
- GitHub Release entry;
- packaged artifact(s);
- SHA-256 checksum manifest;
- protocol/source compatibility manifest or equivalent pinned evidence where applicable.

Until then, use `repository/package state` or `pending GitHub Release publication` rather than `published release`.
