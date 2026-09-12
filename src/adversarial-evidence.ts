import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const TECHNOCORE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

export type EvidenceLabel =
  | "AUTHENTIC_COMPLETE"
  | "AUTHENTIC_GAPPED"
  | "AUTHENTIC_REORDERED"
  | "UNAUTHENTICATED_RECORDS"
  | "EMPTY_TRANSCRIPT"
  | "TIME_UNAUTHENTICATED"
  | "OUTCOME_PROVISIONAL";

export type TrustReason =
  | "UNAUTHENTICATED_TRANSPORT"
  | "NON_PROTOCOL_TEXT_IGNORED"
  | "SENDER_BINDING_MISMATCH"
  | "UNAUTHORIZED_PARTY"
  | "CONTRACT_MISMATCH";

export type SettlementEvidence =
  | "NO_VALUE"
  | "TRANSCRIPT_ONLY"
  | "RAIL_REFERENCE_UNVERIFIED"
  | "RAIL_STATE_UNVERIFIED"
  | "SETTLEMENT_VERIFIED";

export interface EvidenceBinding {
  payer: string;
  payee: string;
  contract: string;
}

export interface EvidenceRecord {
  room: string;
  seq: number;
  sender: string;
  authenticated: boolean;
  type?: string | null;
  frameFrom?: string | null;
  frameContract?: string | null;
  ts?: string | null;
  text?: string | null;
}

export interface TrustDecision {
  accepted: boolean;
  reasons: TrustReason[];
}

export interface TranscriptGap {
  room: string;
  after: number;
  before: number;
}

export interface TranscriptEvidence {
  labels: EvidenceLabel[];
  authenticated: boolean;
  ordered: boolean;
  contiguous: boolean;
  gaps: TranscriptGap[];
  timeAuthority: "VENUE_METADATA_UNAUTHENTICATED";
  outcomeAuthority: "REPLAYABLE_NOT_SETTLEMENT_PROOF" | "PROVISIONAL";
}

export interface SettlementInput {
  rail: string;
  valueBearing: boolean;
  lockFrameValid: boolean;
  railReferenceVerified: boolean;
  railStateVerified: boolean;
}

export function evaluateRecordTrust(record: EvidenceRecord, binding: EvidenceBinding): TrustDecision {
  const reasons: TrustReason[] = [];
  if (!record.authenticated) reasons.push("UNAUTHENTICATED_TRANSPORT");
  if (!record.type) reasons.push("NON_PROTOCOL_TEXT_IGNORED");
  if (record.frameFrom !== record.sender) reasons.push("SENDER_BINDING_MISMATCH");
  if (record.frameFrom !== binding.payer && record.frameFrom !== binding.payee) reasons.push("UNAUTHORIZED_PARTY");
  if (record.frameContract !== binding.contract) reasons.push("CONTRACT_MISMATCH");
  return { accepted: reasons.length === 0, reasons };
}

export function analyzeTranscriptEvidence(records: readonly EvidenceRecord[]): TranscriptEvidence {
  if (records.length === 0) {
    return {
      labels: ["EMPTY_TRANSCRIPT", "TIME_UNAUTHENTICATED", "OUTCOME_PROVISIONAL"],
      authenticated: false,
      ordered: false,
      contiguous: false,
      gaps: [],
      timeAuthority: "VENUE_METADATA_UNAUTHENTICATED",
      outcomeAuthority: "PROVISIONAL",
    };
  }

  const authenticated = records.every((record) => record.authenticated === true);
  let ordered = true;
  let contiguous = true;
  const gaps: TranscriptGap[] = [];
  const byRoom = new Map<string, EvidenceRecord[]>();

  for (const record of records) {
    const rows = byRoom.get(record.room);
    if (rows) rows.push(record);
    else byRoom.set(record.room, [record]);
  }

  for (const [room, rows] of byRoom.entries()) {
    let previous: number | undefined;
    for (const row of rows) {
      if (!Number.isSafeInteger(row.seq) || row.seq < 1) {
        ordered = false;
        contiguous = false;
        continue;
      }
      if (previous !== undefined && row.seq <= previous) ordered = false;
      previous = row.seq;
    }

    const seqs = rows.map((row) => row.seq).filter((seq) => Number.isSafeInteger(seq) && seq >= 1).sort((a, b) => a - b);
    for (let index = 1; index < seqs.length; index += 1) {
      const before = seqs[index];
      const after = seqs[index - 1];
      if (before === undefined || after === undefined) continue;
      if (before === after) {
        contiguous = false;
        ordered = false;
      } else if (before > after + 1) {
        contiguous = false;
        gaps.push({ room, after, before });
      }
    }
  }

  const labels: EvidenceLabel[] = [];
  if (!authenticated) labels.push("UNAUTHENTICATED_RECORDS");
  else if (!ordered) labels.push("AUTHENTIC_REORDERED");
  else if (!contiguous) labels.push("AUTHENTIC_GAPPED");
  else labels.push("AUTHENTIC_COMPLETE");
  labels.push("TIME_UNAUTHENTICATED", "OUTCOME_PROVISIONAL");

  return {
    labels,
    authenticated,
    ordered,
    contiguous,
    gaps,
    timeAuthority: "VENUE_METADATA_UNAUTHENTICATED",
    outcomeAuthority: authenticated && ordered && contiguous ? "REPLAYABLE_NOT_SETTLEMENT_PROOF" : "PROVISIONAL",
  };
}

export function assessSettlementEvidence(input: SettlementInput): SettlementEvidence {
  if (!input.valueBearing || input.rail === "paper") return "NO_VALUE";
  if (!input.lockFrameValid) return "TRANSCRIPT_ONLY";
  if (!input.railReferenceVerified) return "RAIL_REFERENCE_UNVERIFIED";
  if (!input.railStateVerified) return "RAIL_STATE_UNVERIFIED";
  return "SETTLEMENT_VERIFIED";
}

export function isValidTechnocoreName(name: string): boolean {
  return TECHNOCORE_NAME_RE.test(name);
}

export function deriveSafeMailboxName(did: string, prefix = "mb-p"): string {
  if (did.length === 0) throw new Error("EMPTY_DID");
  const digest = createHash("sha256").update(did, "utf8").digest("hex").slice(0, 24);
  const name = `${prefix}-${digest}`;
  if (!isValidTechnocoreName(name)) throw new Error("INVALID_MAILBOX_PREFIX");
  return name;
}

function skipWhitespace(raw: string, start: number): number {
  let index = start;
  while (index < raw.length && /\s/.test(raw[index] ?? "")) index += 1;
  return index;
}

function scanString(raw: string, start: number): number {
  if (raw[start] !== '"') throw new Error("EXPECTED_JSON_STRING");
  let escaped = false;
  for (let index = start + 1; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') return index + 1;
  }
  throw new Error("UNTERMINATED_JSON_STRING");
}

function scanJsonValue(raw: string, start: number): number {
  const first = raw[start];
  if (first === '"') return scanString(raw, start);
  if (first === "{" || first === "[") {
    const stack: string[] = [first === "{" ? "}" : "]"];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < raw.length; index += 1) {
      const char = raw[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
      else if (char === stack[stack.length - 1]) {
        stack.pop();
        if (stack.length === 0) return index + 1;
      }
    }
    throw new Error("UNTERMINATED_JSON_VALUE");
  }

  let index = start;
  while (index < raw.length && raw[index] !== "," && raw[index] !== "}") index += 1;
  return index;
}

function topLevelFieldToken(raw: string, field: string): string | null {
  let index = skipWhitespace(raw, 0);
  if (raw[index] !== "{") throw new Error("TRANSPORT_RECORD_NOT_OBJECT");
  index += 1;

  while (index < raw.length) {
    index = skipWhitespace(raw, index);
    if (raw[index] === "}") return null;
    const keyStart = index;
    const keyEnd = scanString(raw, keyStart);
    const key = JSON.parse(raw.slice(keyStart, keyEnd)) as unknown;
    if (typeof key !== "string") throw new Error("INVALID_JSON_KEY");

    index = skipWhitespace(raw, keyEnd);
    if (raw[index] !== ":") throw new Error("EXPECTED_JSON_COLON");
    index = skipWhitespace(raw, index + 1);
    const valueStart = index;
    const valueEnd = scanJsonValue(raw, valueStart);
    if (key === field) return raw.slice(valueStart, valueEnd).trim();

    index = skipWhitespace(raw, valueEnd);
    if (raw[index] === ",") {
      index += 1;
      continue;
    }
    if (raw[index] === "}") return null;
    throw new Error("INVALID_JSON_OBJECT");
  }
  throw new Error("UNTERMINATED_JSON_OBJECT");
}

export function extractLosslessTransportNonce(rawJson: string): string | null {
  const token = topLevelFieldToken(rawJson, "nonce");
  if (token === null) return null;
  const value = token.startsWith('"') ? JSON.parse(token) as unknown : token;
  if (typeof value !== "string" || !/^[0-9]{1,19}$/.test(value)) throw new Error("TRANSPORT_NONCE_NOT_DECIMAL_TEXT");
  return value;
}

export function parseTransportRecordLossless(rawJson: string): Record<string, unknown> {
  const parsed = JSON.parse(rawJson) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("TRANSPORT_RECORD_NOT_OBJECT");
  const record = parsed as Record<string, unknown>;
  const nonce = extractLosslessTransportNonce(rawJson);
  if (nonce !== null) record.nonce = nonce;
  return record;
}

interface FixtureCase {
  id: string;
  expected?: "ACCEPT" | "REJECT" | "IGNORE";
  reason?: TrustReason;
  expectedEvidence?: EvidenceLabel[];
  expectedSettlement?: SettlementEvidence;
  mailbox?: string;
  raw?: string;
  expectedNonce?: string;
  seq?: number[];
  sender?: string;
  authenticated?: boolean;
  type?: string | null;
  frameFrom?: string | null;
  frameContract?: string | null;
  text?: string | null;
  rail?: string;
  valueBearing?: boolean;
  lockFrameValid?: boolean;
  railReferenceVerified?: boolean;
  railStateVerified?: boolean;
}

interface AdversarialFixture {
  schema: string;
  binding: EvidenceBinding & { room: string };
  cases: FixtureCase[];
  provenance: unknown[];
}

export function runAdversarialEvidenceFixture(): Record<string, unknown> {
  const fixture = JSON.parse(
    readFileSync(new URL("../conformance/fixtures/adversarial-evidence-suite-v1.json", import.meta.url), "utf8"),
  ) as AdversarialFixture;

  const failures: Array<{ id: string; error: string }> = [];
  let passed = 0;

  for (const item of fixture.cases) {
    try {
      if (item.raw !== undefined) {
        const nonce = extractLosslessTransportNonce(item.raw);
        if (nonce !== item.expectedNonce) throw new Error(`NONCE_MISMATCH:${String(nonce)}`);
      } else if (item.mailbox !== undefined) {
        const valid = isValidTechnocoreName(item.mailbox);
        if ((item.expected === "ACCEPT") !== valid) throw new Error(`MAILBOX_EXPECTATION_MISMATCH:${valid}`);
      } else if (item.expectedSettlement !== undefined) {
        const actual = assessSettlementEvidence({
          rail: item.rail ?? "",
          valueBearing: item.valueBearing ?? false,
          lockFrameValid: item.lockFrameValid ?? false,
          railReferenceVerified: item.railReferenceVerified ?? false,
          railStateVerified: item.railStateVerified ?? false,
        });
        if (actual !== item.expectedSettlement) throw new Error(`SETTLEMENT_MISMATCH:${actual}`);
      } else if (item.expectedEvidence !== undefined && item.seq !== undefined) {
        const rows: EvidenceRecord[] = item.seq.map((seq) => ({
          room: fixture.binding.room,
          seq,
          sender: fixture.binding.payer,
          authenticated: true,
          type: "lock",
          frameFrom: fixture.binding.payer,
          frameContract: fixture.binding.contract,
        }));
        const evidence = analyzeTranscriptEvidence(rows);
        for (const label of item.expectedEvidence) {
          if (!evidence.labels.includes(label)) throw new Error(`MISSING_EVIDENCE_LABEL:${label}`);
        }
      } else if (item.expected !== undefined) {
        const decision = evaluateRecordTrust({
          room: fixture.binding.room,
          seq: 1,
          sender: item.sender ?? "",
          authenticated: item.authenticated ?? false,
          type: item.type ?? null,
          frameFrom: item.frameFrom ?? null,
          frameContract: item.frameContract ?? null,
          text: item.text ?? null,
        }, fixture.binding);

        const expectedAccepted = item.expected === "ACCEPT";
        if (decision.accepted !== expectedAccepted) throw new Error(`TRUST_EXPECTATION_MISMATCH:${decision.accepted}`);
        if (item.reason && !decision.reasons.includes(item.reason)) throw new Error(`MISSING_REASON:${item.reason}`);
      }
      passed += 1;
    } catch (error) {
      failures.push({ id: item.id, error: error instanceof Error ? error.message : "FAILED" });
    }
  }

  if (failures.length > 0) throw new Error(`ADVERSARIAL_EVIDENCE_FIXTURE_FAILED:${JSON.stringify(failures)}`);

  return {
    schema: fixture.schema,
    cases: fixture.cases.length,
    passed,
    failures: 0,
    provenanceItems: fixture.provenance.length,
  };
}
