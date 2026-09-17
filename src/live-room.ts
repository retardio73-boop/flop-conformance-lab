import { createHash } from "node:crypto";
import { parseTranscriptExport, type TranscriptRecord } from "@flop-labs/tclk";
import { verifyExternalProfile, type PortableConformanceResult } from "./profiles.js";

const ROOM_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
export const DEFAULT_TECHNOCORE_URL = "https://technocore.chat";

export interface LiveRoomBinding {
  payer: string;
  payee: string;
  contract: string;
}

export interface LiveRoomCaptureOptions {
  room: string;
  binding: LiveRoomBinding;
  baseUrl?: string;
  requireComplete?: boolean;
  implementation?: string;
  revision?: string;
  fetch?: typeof globalThis.fetch;
}

interface ProfileRecord {
  room: string;
  generation: number;
  seq: number;
  ts: string;
  from: string;
  text: string;
  nonce: string;
  sig: string;
}

export interface LiveRoomEvidenceBundle {
  schema: "flop-live-room-evidence/v1";
  status: "VERIFIED" | "PARTIAL" | "NOT_VERIFIED";
  capturedAt: string;
  source: {
    venue: "technocore";
    baseUrl: string;
    room: string;
    exportPath: string;
    exportSha256: string;
    exportBytes: number;
    totalRecords: number;
    signedRecords: number;
    unsignedRecords: number;
    generationModel: "capture-local-0";
  };
  input: {
    implementation?: string;
    revision?: string;
    binding: LiveRoomBinding;
    requireComplete: boolean;
    records: ProfileRecord[];
  };
  report: PortableConformanceResult;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("INVALID_TECHNOCORE_URL");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname))) {
    throw new Error("TECHNOCORE_URL_MUST_USE_HTTPS");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

function assertRoom(room: string): string {
  if (!ROOM_RE.test(room)) throw new Error("INVALID_ROOM_NAME");
  return room;
}

function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readBodyOrThrow(response: Response, what: string): Promise<string> {
  const body = await response.text();
  if (!response.ok) {
    const firstLine = body.split("\n", 1)[0] ?? "";
    throw new Error(`${what}_FAILED:${response.status}${firstLine ? `:${firstLine}` : ""}`);
  }
  return body;
}

function toProfileRecord(record: TranscriptRecord): ProfileRecord | null {
  if (record.nonce === null || record.signature === null) return null;
  return {
    room: record.room,
    // Technocore /export does not expose a durable room-generation identifier. The raw
    // export hash remains the provenance anchor; generation 0 is local to this capture.
    generation: 0,
    seq: record.seq,
    ts: new Date(record.timestampMs).toISOString(),
    from: record.sender,
    text: record.line,
    nonce: record.nonce,
    sig: record.signature,
  };
}

function bundleStatus(report: PortableConformanceResult, unsignedRecords: number): LiveRoomEvidenceBundle["status"] {
  if (report.result === "FAIL") return "NOT_VERIFIED";
  if (report.result === "PARTIAL" || unsignedRecords > 0) return "PARTIAL";
  return "VERIFIED";
}

export async function captureAndVerifyLiveRoom(options: LiveRoomCaptureOptions): Promise<{ bundle: LiveRoomEvidenceBundle; rawExport: string }> {
  const room = assertRoom(options.room);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.TECHNOCORE_URL ?? DEFAULT_TECHNOCORE_URL);
  const exportPath = `/r/${room}/export`;
  const doFetch = options.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error("FETCH_UNAVAILABLE");

  const response = await doFetch(`${baseUrl}${exportPath}`, {
    method: "GET",
    headers: { accept: "text/plain" },
  });
  const rawExport = await readBodyOrThrow(response, "ROOM_EXPORT");
  const exportedRecords = parseTranscriptExport(room, rawExport);
  if (exportedRecords.length === 0) throw new Error("EMPTY_ROOM_EXPORT");

  const records = exportedRecords.map(toProfileRecord).filter((record): record is ProfileRecord => record !== null);
  const unsignedRecords = exportedRecords.length - records.length;
  const input = {
    ...(options.implementation ? { implementation: options.implementation } : {}),
    ...(options.revision ? { revision: options.revision } : {}),
    binding: options.binding,
    requireComplete: options.requireComplete ?? true,
    records,
  };
  const report = verifyExternalProfile("tclk-transcript", input);

  return {
    rawExport,
    bundle: {
      schema: "flop-live-room-evidence/v1",
      status: bundleStatus(report, unsignedRecords),
      capturedAt: new Date().toISOString(),
      source: {
        venue: "technocore",
        baseUrl,
        room,
        exportPath,
        exportSha256: sha256Utf8(rawExport),
        exportBytes: Buffer.byteLength(rawExport, "utf8"),
        totalRecords: exportedRecords.length,
        signedRecords: records.length,
        unsignedRecords,
        generationModel: "capture-local-0",
      },
      input,
      report,
    },
  };
}
