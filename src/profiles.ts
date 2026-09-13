import { readFileSync } from "node:fs";
import { tryDecodeFrame } from "@flop-labs/tclk";
import {
  analyzeTranscriptEvidence,
  assessSettlementEvidence,
  isValidTechnocoreName,
  type EvidenceRecord,
  type SettlementInput,
} from "./adversarial-evidence.js";
import { didKeyBytes, transportRepresentable, verifyTechnocoreRecord } from "./technocore.js";
import type { TransportRecord } from "./types.js";

export const EXTERNAL_PROFILES = ["tclk-transcript", "technocore-agent"] as const;
export type ExternalProfile = (typeof EXTERNAL_PROFILES)[number];
export type PortableCheckStatus = "PASS" | "WARN" | "FAIL" | "SKIP";
export type PortableResultStatus = "PASS" | "PARTIAL" | "FAIL";

export interface PortableCheck {
  id: string;
  status: PortableCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface PortableConformanceResult {
  schema: "flop-conformance-result/v1";
  profile: ExternalProfile;
  profileVersion: "1";
  labVersion: string;
  generatedAt: string;
  implementation?: string;
  revision?: string;
  result: PortableResultStatus;
  summary: { pass: number; warn: number; fail: number; skip: number };
  checks: PortableCheck[];
}

type JsonObject = Record<string, unknown>;

function packageVersion(): string {
  const metadata = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("PACKAGE_VERSION_UNAVAILABLE");
  }
  return metadata.version;
}

function asObject(value: unknown, name: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`INVALID_${name}`);
  }
  return value as JsonObject;
}

function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function optionalString(object: JsonObject, key: string): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function optionalBoolean(object: JsonObject, key: string, fallback = false): boolean {
  const value = object[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`INVALID_${key.toUpperCase()}`);
  return value;
}

function normalizeNonce(value: unknown): string | number {
  if (typeof value === "string" && /^(?:0|[1-9][0-9]{0,18})$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  throw new Error("INVALID_TRANSPORT_NONCE");
}

function normalizeTransportRecord(value: unknown): TransportRecord {
  const record = asObject(value, "TRANSPORT_RECORD");
  const generation = record.generation;
  const seq = record.seq;
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) throw new Error("INVALID_GENERATION");
  if (!Number.isSafeInteger(seq) || (seq as number) < 1) throw new Error("INVALID_SEQ");
  return {
    room: requiredString(record, "room"),
    generation: generation as number,
    seq: seq as number,
    ts: requiredString(record, "ts"),
    from: requiredString(record, "from"),
    text: requiredString(record, "text"),
    nonce: normalizeNonce(record.nonce),
    sig: requiredString(record, "sig"),
  };
}

function check(id: string, status: PortableCheckStatus, message: string, details?: Record<string, unknown>): PortableCheck {
  return details === undefined ? { id, status, message } : { id, status, message, details };
}

function metadata(input: JsonObject): { implementation?: string; revision?: string } {
  return {
    implementation: optionalString(input, "implementation"),
    revision: optionalString(input, "revision"),
  };
}

function finalize(profile: ExternalProfile, input: JsonObject, checks: PortableCheck[]): PortableConformanceResult {
  const summary = {
    pass: checks.filter((item) => item.status === "PASS").length,
    warn: checks.filter((item) => item.status === "WARN").length,
    fail: checks.filter((item) => item.status === "FAIL").length,
    skip: checks.filter((item) => item.status === "SKIP").length,
  };
  const result: PortableResultStatus = summary.fail > 0 ? "FAIL" : summary.warn > 0 ? "PARTIAL" : "PASS";
  return {
    schema: "flop-conformance-result/v1",
    profile,
    profileVersion: "1",
    labVersion: packageVersion(),
    generatedAt: new Date().toISOString(),
    ...metadata(input),
    result,
    summary,
    checks,
  };
}

function failureResult(profile: ExternalProfile, rawInput: unknown, error: unknown): PortableConformanceResult {
  const input = rawInput !== null && typeof rawInput === "object" && !Array.isArray(rawInput) ? rawInput as JsonObject : {};
  return finalize(profile, input, [
    check("input.shape", "FAIL", error instanceof Error ? error.message : "INVALID_PROFILE_INPUT"),
  ]);
}

function parseSettlement(value: unknown): SettlementInput & { requireVerified: boolean } {
  const settlement = asObject(value, "SETTLEMENT");
  const rail = requiredString(settlement, "rail");
  const bool = (key: string): boolean => {
    const candidate = settlement[key];
    if (typeof candidate !== "boolean") throw new Error(`INVALID_${key.toUpperCase()}`);
    return candidate;
  };
  return {
    rail,
    valueBearing: bool("valueBearing"),
    lockFrameValid: bool("lockFrameValid"),
    railReferenceVerified: bool("railReferenceVerified"),
    railStateVerified: bool("railStateVerified"),
    requireVerified: optionalBoolean(settlement, "requireVerified", false),
  };
}

function verifyTclkTranscript(rawInput: unknown): PortableConformanceResult {
  try {
    const input = asObject(rawInput, "PROFILE_INPUT");
    const bindingObject = asObject(input.binding, "BINDING");
    const binding = {
      payer: requiredString(bindingObject, "payer"),
      payee: requiredString(bindingObject, "payee"),
      contract: requiredString(bindingObject, "contract"),
    };
    const requireComplete = optionalBoolean(input, "requireComplete", false);
    if (!Array.isArray(input.records) || input.records.length === 0) throw new Error("EMPTY_RECORDS");
    const records = input.records.map(normalizeTransportRecord);
    const checks: PortableCheck[] = [];

    const representableFailures = records.filter((record) => !transportRepresentable(record.text));
    checks.push(check(
      "transport.representable",
      representableFailures.length === 0 ? "PASS" : "FAIL",
      representableFailures.length === 0 ? "All supplied record texts are transport-representable." : "One or more record texts are not transport-representable.",
      { total: records.length, failures: representableFailures.length },
    ));

    const signatureFailures = records.filter((record) => !verifyTechnocoreRecord(record));
    checks.push(check(
      "transport.signature",
      signatureFailures.length === 0 ? "PASS" : "FAIL",
      signatureFailures.length === 0 ? "All supplied Technocore signatures verify over room|nonce|text." : "One or more Technocore signatures failed verification.",
      { total: records.length, failures: signatureFailures.length },
    ));

    const decoded: Array<{ record: TransportRecord; frame: JsonObject }> = [];
    let inertText = 0;
    for (const record of records) {
      const frame = tryDecodeFrame(record.text);
      if (frame === null) {
        inertText += 1;
        continue;
      }
      decoded.push({ record, frame: frame as unknown as JsonObject });
    }
    checks.push(check(
      "tclk.frame-presence",
      decoded.length > 0 ? "PASS" : "FAIL",
      decoded.length > 0 ? "At least one canonical TCLK frame is present; non-protocol room text remains inert." : "No decodable TCLK frame was supplied.",
      { frames: decoded.length, inertText },
    ));

    const senderMismatches = decoded.filter(({ record, frame }) => frame.from !== record.from);
    checks.push(check(
      "tclk.sender-binding",
      senderMismatches.length === 0 ? "PASS" : "FAIL",
      senderMismatches.length === 0 ? "Every decoded TCLK frame sender matches the authenticated transport sender." : "A decoded TCLK frame sender does not match its transport sender.",
      { frames: decoded.length, mismatches: senderMismatches.length },
    ));

    const unauthorizedParties = decoded.filter(({ frame }) => frame.from !== binding.payer && frame.from !== binding.payee);
    checks.push(check(
      "tclk.party-binding",
      unauthorizedParties.length === 0 ? "PASS" : "FAIL",
      unauthorizedParties.length === 0 ? "Every decoded frame sender belongs to the declared payer/payee pair." : "A decoded frame is authored by a DID outside the declared contract parties.",
      { frames: decoded.length, unauthorized: unauthorizedParties.length },
    ));

    const contractBearing = decoded.filter(({ frame }) => typeof frame.contract === "string");
    const contractMismatches = contractBearing.filter(({ frame }) => frame.contract !== binding.contract);
    checks.push(check(
      "tclk.contract-binding",
      contractMismatches.length > 0 ? "FAIL" : contractBearing.length === 0 ? "WARN" : "PASS",
      contractMismatches.length > 0
        ? "A contract-bearing TCLK frame references a different contract."
        : contractBearing.length === 0
          ? "No supplied TCLK frame carries a contract field, so contract binding cannot be demonstrated."
          : "Every contract-bearing TCLK frame references the declared contract.",
      { contractBearing: contractBearing.length, mismatches: contractMismatches.length },
    ));

    const evidenceRows: EvidenceRecord[] = decoded.map(({ record, frame }) => ({
      room: `${record.room}#generation-${record.generation}`,
      seq: record.seq,
      sender: record.from,
      authenticated: verifyTechnocoreRecord(record),
      type: typeof frame.type === "string" ? frame.type : null,
      frameFrom: typeof frame.from === "string" ? frame.from : null,
      frameContract: typeof frame.contract === "string" ? frame.contract : null,
      ts: record.ts,
      text: record.text,
    }));
    const evidence = analyzeTranscriptEvidence(evidenceRows);
    const degraded = evidence.labels.includes("AUTHENTIC_GAPPED") || evidence.labels.includes("AUTHENTIC_REORDERED") || evidence.labels.includes("UNAUTHENTICATED_RECORDS");
    checks.push(check(
      "evidence.sequence-quality",
      degraded ? (requireComplete ? "FAIL" : "WARN") : "PASS",
      degraded
        ? requireComplete
          ? "Transcript evidence is incomplete, reordered, or unauthenticated while requireComplete=true."
          : "Transcript evidence is incomplete, reordered, or unauthenticated; state derived from it must remain provisional."
        : "Transcript evidence is authenticated, ordered, and contiguous within each room generation.",
      { labels: evidence.labels, gaps: evidence.gaps, requireComplete },
    ));
    checks.push(check(
      "evidence.time-authority",
      "PASS",
      "Technocore venue timestamps are classified separately from sender-authenticated content.",
      { timeAuthority: evidence.timeAuthority, outcomeAuthority: evidence.outcomeAuthority },
    ));

    if (input.settlement === undefined) {
      checks.push(check("settlement.boundary", "SKIP", "No settlement evidence was supplied; this profile makes no settlement claim."));
    } else {
      const settlement = parseSettlement(input.settlement);
      const classification = assessSettlementEvidence(settlement);
      const failure = settlement.requireVerified && classification !== "SETTLEMENT_VERIFIED";
      checks.push(check(
        "settlement.boundary",
        failure ? "FAIL" : "PASS",
        failure ? "Verified settlement was required but the supplied evidence does not reach SETTLEMENT_VERIFIED." : "Settlement evidence was classified without promoting transcript activity into a value-settlement claim.",
        { classification, requireVerified: settlement.requireVerified },
      ));
    }

    return finalize("tclk-transcript", input, checks);
  } catch (error) {
    return failureResult("tclk-transcript", rawInput, error);
  }
}

function verifyTechnocoreAgent(rawInput: unknown): PortableConformanceResult {
  try {
    const input = asObject(rawInput, "PROFILE_INPUT");
    const did = requiredString(input, "did");
    const mailbox = requiredString(input, "mailbox");
    const requireComplete = optionalBoolean(input, "requireComplete", false);
    const checks: PortableCheck[] = [];

    try {
      didKeyBytes(did);
      checks.push(check("identity.did-key", "PASS", "DID decodes as an Ed25519 did:key."));
    } catch (error) {
      checks.push(check("identity.did-key", "FAIL", error instanceof Error ? error.message : "INVALID_DID"));
    }

    checks.push(check(
      "identity.mailbox-name",
      isValidTechnocoreName(mailbox) ? "PASS" : "FAIL",
      isValidTechnocoreName(mailbox) ? "Mailbox name satisfies the Technocore name grammar." : "Mailbox name violates the Technocore name grammar.",
      { mailbox },
    ));

    const rawRecords = input.records;
    if (rawRecords === undefined || (Array.isArray(rawRecords) && rawRecords.length === 0)) {
      checks.push(check("identity.signed-mailbox-evidence", "WARN", "No signed mailbox records were supplied, so reachability and DID ownership are not demonstrated by this invocation."));
      return finalize("technocore-agent", input, checks);
    }
    if (!Array.isArray(rawRecords)) throw new Error("INVALID_RECORDS");
    const records = rawRecords.map(normalizeTransportRecord);

    const signatureFailures = records.filter((record) => !verifyTechnocoreRecord(record));
    checks.push(check(
      "identity.signed-mailbox-evidence",
      signatureFailures.length === 0 ? "PASS" : "FAIL",
      signatureFailures.length === 0 ? "Every supplied mailbox record has a valid Technocore signature." : "One or more mailbox records failed signature verification.",
      { total: records.length, failures: signatureFailures.length },
    ));

    const didMismatches = records.filter((record) => record.from !== did);
    checks.push(check(
      "identity.did-binding",
      didMismatches.length === 0 ? "PASS" : "FAIL",
      didMismatches.length === 0 ? "Every supplied signed record is authored by the declared DID." : "A supplied record is authored by a different DID.",
      { mismatches: didMismatches.length },
    ));

    const mailboxMismatches = records.filter((record) => record.room !== mailbox);
    checks.push(check(
      "identity.mailbox-binding",
      mailboxMismatches.length === 0 ? "PASS" : "FAIL",
      mailboxMismatches.length === 0 ? "Every supplied record belongs to the declared mailbox." : "A supplied record belongs to a different room.",
      { mismatches: mailboxMismatches.length },
    ));

    const representationFailures = records.filter((record) => !transportRepresentable(record.text));
    checks.push(check(
      "identity.transport-representable",
      representationFailures.length === 0 ? "PASS" : "FAIL",
      representationFailures.length === 0 ? "Every supplied mailbox text is transport-representable." : "A supplied mailbox text is not transport-representable.",
      { failures: representationFailures.length },
    ));

    const evidenceRows: EvidenceRecord[] = records.map((record) => ({
      room: `${record.room}#generation-${record.generation}`,
      seq: record.seq,
      sender: record.from,
      authenticated: verifyTechnocoreRecord(record),
      ts: record.ts,
      text: record.text,
    }));
    const evidence = analyzeTranscriptEvidence(evidenceRows);
    const degraded = evidence.labels.includes("AUTHENTIC_GAPPED") || evidence.labels.includes("AUTHENTIC_REORDERED") || evidence.labels.includes("UNAUTHENTICATED_RECORDS");
    checks.push(check(
      "identity.sequence-quality",
      degraded ? (requireComplete ? "FAIL" : "WARN") : "PASS",
      degraded
        ? requireComplete
          ? "Mailbox evidence is incomplete, reordered, or unauthenticated while requireComplete=true."
          : "Mailbox evidence is incomplete, reordered, or unauthenticated; do not infer absence from missing history."
        : "Mailbox evidence is authenticated, ordered, and contiguous within each generation.",
      { labels: evidence.labels, gaps: evidence.gaps, requireComplete },
    ));
    checks.push(check(
      "identity.time-authority",
      "PASS",
      "Venue timestamps are explicitly treated as unauthenticated metadata rather than DID-signed time.",
      { timeAuthority: evidence.timeAuthority },
    ));

    return finalize("technocore-agent", input, checks);
  } catch (error) {
    return failureResult("technocore-agent", rawInput, error);
  }
}

export function verifyExternalProfile(profile: string, input: unknown): PortableConformanceResult {
  if (profile === "tclk-transcript") return verifyTclkTranscript(input);
  if (profile === "technocore-agent") return verifyTechnocoreAgent(input);
  throw new Error(`UNKNOWN_EXTERNAL_PROFILE:${profile}`);
}
