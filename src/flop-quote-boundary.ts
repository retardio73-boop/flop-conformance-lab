import { readFileSync } from "node:fs";

const FIXTURE_URL = new URL(
  "../conformance/fixtures/flop-quote-open-channel-receipt-v0.5.0.json",
  import.meta.url,
);

const PINNED_YELLOWPAPER_COMMIT = "3eaf2f25bc46a501df225cae4e4e991975f6b2a9";
const RECEIPT_DOMAIN = "FLOP/COMPUTE_CHANNEL/RECEIPT";
const U128_MAX = (1n << 128n) - 1n;

const OPEN_CHANNEL_FIELDS = [
  "miner",
  "model_hash",
  "measured_root",
  "decode_policy_hash",
  "precision",
  "enclave_key",
  "agent_key",
  "sla",
  "escrow",
  "nonce",
  "settlement_class",
] as const;

const RECEIPT_BINDS = ["channel_id", "final_root", "aggregate_gn", "payable"] as const;

type ExpectedCase = {
  id: string;
  expected: {
    status: "PASS" | "FAIL_CLOSED";
    stage: "quote_to_open_channel" | "open_channel_to_receipt";
    reason: string;
  };
};

type Fixture = {
  id: string;
  classification: string;
  upstream: {
    commit: string;
    publicRuntime: string;
    issues: number[];
  };
  quoteBoundary: {
    canonicalDiscoveryContract: unknown | null;
    expected: { status: string; reason: string };
    mustNotInfer: string[];
  };
  openChannelTarget: {
    fields: string[];
    quoteBridgeCritical: string[];
    escrowUnitStatus: string;
  };
  receiptTarget: {
    domainAscii: string;
    versionByte: number;
    binds: string[];
    encoding: Record<string, string>;
    vector: {
      channelIdHex: string;
      finalRootHex: string;
      aggregateGn: string;
      payable: string;
      expectedMessageHex: string;
    };
  };
  cases: ExpectedCase[];
  scope: {
    networkMutation: boolean;
    liveSettlement: boolean;
    signatureGeneration: boolean;
    claimCanonicalQuoteSchemaExists: boolean;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertExactList(actual: string[], expected: readonly string[], label: string): void {
  assert(actual.length === expected.length, `${label}_FIELD_COUNT_DIVERGENCE`);
  for (let i = 0; i < expected.length; i += 1) {
    assert(actual[i] === expected[i], `${label}_FIELD_ORDER_DIVERGENCE`);
  }
}

function parseHex32(value: string, label: string): Buffer {
  assert(/^[0-9a-f]{64}$/i.test(value), `${label}_MUST_BE_32_BYTES_HEX`);
  return Buffer.from(value, "hex");
}

function u128le(value: string, label: string): Buffer {
  assert(/^\d+$/.test(value), `${label}_MUST_BE_UNSIGNED_DECIMAL`);
  let n = BigInt(value);
  assert(n <= U128_MAX, `${label}_U128_OVERFLOW`);
  const out = Buffer.alloc(16);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export function receiptMessageV1(input: {
  channelIdHex: string;
  finalRootHex: string;
  aggregateGn: string;
  payable: string;
}): Buffer {
  return Buffer.concat([
    Buffer.from(RECEIPT_DOMAIN, "ascii"),
    Buffer.from([1]),
    parseHex32(input.channelIdHex, "CHANNEL_ID"),
    parseHex32(input.finalRootHex, "FINAL_ROOT"),
    u128le(input.aggregateGn, "AGGREGATE_GN"),
    u128le(input.payable, "PAYABLE"),
  ]);
}

export function validateQuoteChannelReceiptFixture(): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as Fixture;

  assert(fixture.upstream.commit === PINNED_YELLOWPAPER_COMMIT, "YELLOWPAPER_PIN_DIVERGENCE");
  assert(fixture.upstream.issues.includes(26), "ISSUE_26_NOT_PINNED");
  assert(fixture.upstream.issues.includes(33), "ISSUE_33_NOT_PINNED");
  assert(
    fixture.upstream.publicRuntime === "PUBLIC_RUNTIME_UNAVAILABLE",
    "LIVE_RUNTIME_MUST_NOT_BE_CLAIMED",
  );

  assert(
    fixture.quoteBoundary.canonicalDiscoveryContract === null,
    "CANONICAL_QUOTE_SCHEMA_MUST_NOT_BE_INVENTED",
  );
  assert(fixture.quoteBoundary.expected.status === "FAIL_CLOSED", "QUOTE_BOUNDARY_MUST_FAIL_CLOSED");
  assert(
    fixture.quoteBoundary.expected.reason === "NO_CANONICAL_QUOTE_DISCOVERY_CONTRACT",
    "QUOTE_BOUNDARY_REASON_DIVERGENCE",
  );
  for (const forbidden of [
    "aggregate_gn_is_currency",
    "aggregate_gn_is_physical_flops",
    "external_per_token_price_to_channel_escrow",
    "numeric_ranking_across_unlike_quote_units",
  ]) {
    assert(fixture.quoteBoundary.mustNotInfer.includes(forbidden), `MISSING_GUARD_${forbidden}`);
  }

  assertExactList(fixture.openChannelTarget.fields, OPEN_CHANNEL_FIELDS, "OPEN_CHANNEL");
  assert(fixture.openChannelTarget.quoteBridgeCritical.includes("escrow"), "ESCROW_NOT_BRIDGE_CRITICAL");
  assert(
    fixture.openChannelTarget.escrowUnitStatus === "UNRESOLVED_FOR_QUOTE_NORMALIZATION",
    "ESCROW_UNIT_AMBIGUITY_HIDDEN",
  );

  assert(fixture.receiptTarget.domainAscii === RECEIPT_DOMAIN, "RECEIPT_DOMAIN_DIVERGENCE");
  assert(fixture.receiptTarget.versionByte === 1, "RECEIPT_VERSION_DIVERGENCE");
  assertExactList(fixture.receiptTarget.binds, RECEIPT_BINDS, "RECEIPT_BINDING");
  assert(fixture.receiptTarget.encoding.aggregate_gn === "u128LE", "AGGREGATE_GN_ENCODING_DIVERGENCE");
  assert(fixture.receiptTarget.encoding.payable === "u128LE", "PAYABLE_ENCODING_DIVERGENCE");

  const message = receiptMessageV1(fixture.receiptTarget.vector);
  assert(
    message.toString("hex") === fixture.receiptTarget.vector.expectedMessageHex,
    "RECEIPT_PREIMAGE_DIVERGENCE",
  );

  const perToken = fixture.cases.find((item) => item.id === "external-per-token-quote");
  const payUnit = fixture.cases.find((item) => item.id === "reserved-session-with-unresolved-pay-unit");
  const receipt = fixture.cases.find(
    (item) => item.id === "receipt-binding-after-authoritative-channel-input",
  );
  assert(perToken?.expected.status === "FAIL_CLOSED", "PER_TOKEN_CASE_MUST_FAIL_CLOSED");
  assert(payUnit?.expected.reason === "CHANNEL_PAY_UNIT_UNRESOLVED", "PAY_UNIT_CASE_REASON_DIVERGENCE");
  assert(receipt?.expected.status === "PASS", "RECEIPT_VECTOR_MUST_PASS");

  assert(!fixture.scope.networkMutation, "FIXTURE_MUST_BE_OFFLINE");
  assert(!fixture.scope.liveSettlement, "FIXTURE_MUST_NOT_SETTLE");
  assert(!fixture.scope.signatureGeneration, "FIXTURE_MUST_NOT_REQUIRE_SIGNING");
  assert(!fixture.scope.claimCanonicalQuoteSchemaExists, "FIXTURE_MUST_NOT_CLAIM_CANONICAL_QUOTE_SCHEMA");

  return {
    fixture: fixture.id,
    classification: fixture.classification,
    yellowpaperCommit: fixture.upstream.commit,
    quoteToOpenChannel: "FAIL_CLOSED",
    quoteBoundaryReason: fixture.quoteBoundary.expected.reason,
    payUnitBoundary: "CHANNEL_PAY_UNIT_UNRESOLVED",
    openChannelToReceipt: "BYTE_EXACT_STRUCTURAL_PASS",
    receiptMessageBytes: message.length,
    liveRuntime: fixture.upstream.publicRuntime,
  };
}
