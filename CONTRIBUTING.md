# Contributing

Thank you for helping improve FLOP Conformance Lab. This is a community-built, unofficial alpha project and not a FLOP Labs product.

## Before opening a change

- Preserve released protocol vectors exactly; add separate regression fixtures or explicitly labelled compatibility workarounds.
- Pin deterministic baselines. Required CI must not follow floating upstream branches or depend on live services.
- Never commit credentials, private keys, wallets, production identities, private telemetry, databases, or operator data.
- Keep release conformance, upstream comparison, target-spec checks, and live-runtime behavior clearly distinguished.
- Open an issue before proposing a large new conformance lane. Focused regressions and fixes can be submitted directly.

## Evidence gate

New code should exist because it closes a concrete interoperability boundary, not because a generic component might be useful someday. A proposed feature should satisfy at least one of these:

- reproduce an observed cross-system incompatibility or protocol-drift failure;
- encode a released or pinned normative boundary that two implementations can disagree on;
- turn an upstream issue, erratum, real integration failure, or externally observed behavior into a deterministic fixture;
- remove a proven operational blocker in the existing TCLK ↔ Technocore ↔ Router ↔ FLOP path.

Prefer the smallest fixture, adapter or check that proves the boundary. Do not add generic agent frameworks, broad monitoring systems, duplicate Technocore server-conformance coverage, speculative settlement logic, placeholder integrations or abstraction layers without a current consumer. Learning and experiments are welcome, but they should remain local or clearly experimental until they produce a falsifiable boundary worth preserving here.

## Local verification

Use a supported Node.js version and run:

```sh
npm ci --ignore-scripts
npm run check
```

Pull requests should identify the normative source, pinned version or commit, expected boundary behavior, tests performed, and any remaining alpha limitation. No productive DID, passphrase, wallet, FLOP runtime, or API key is required.

Report security vulnerabilities through GitHub's private vulnerability reporting instead of a public issue.
