# E.49 demand-independence boundary

The Lab treats FLOP Yellow Paper E.49 and upstream issue #58 as an unresolved evidence boundary, not as a solved Sybil-classification problem.

The invariant is intentionally narrow:

- a valid, co-signed, settled receipt may prove protocol-authorized settled work;
- it does not by itself prove economically independent demand;
- multiple authenticated DIDs do not by themselves prove multiple independent operators;
- neither signal is converted into Agents allocation credit while E.38/E.40 remain unresolved.

The Lab therefore exposes separate evidence dimensions rather than collapsing them into one reputation score:

- `settlement`: whether value-bearing settlement evidence is verified;
- `demandIndependence`: `UNVERIFIED` unless a future normative rule provides an independently checkable basis;
- `operatorCount`: `UNVERIFIED` without an authoritative operator/account binding;
- `allocationCredit`: `NOT_DERIVED` while allocation policy remains TBD.

This fixture does not implement a Sybil detector, infer common control from timing/templates, deanonymize operators, or prescribe a staking/slashing formula. Those are policy/mechanism questions upstream must resolve.

## Portable receipt implication

A portable Work/Execution Receipt should keep these fields orthogonal. It may carry authenticated actor DIDs, work/result hashes, venue/readback evidence and settlement status, but must not silently upgrade any of them into `independent_demand=true` or an operator count.

## Agent Control Plane implication

The private Agent Control Plane should continue optimizing for one persistent canonical identity, useful inference, authoritative readback and durable receipts. It should not create additional identities or synthetic counterparties to manufacture activity.
