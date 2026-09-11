import {createHash} from "node:crypto";
import {
  canonicalSonnetJson, SONNET_CONTEST_ID, SONNET_WRITER_DID,
  type AuthenticatedDidSignerBoundary, type SignedSonnetEnvelope,
} from "./sonnet.js";

export const DISCOVERY_ROOM = "mb-sonnet-2-discovery" as const;
export const CAMPAIGN_ROOM = "mb-sonnet-2-campaign" as const;
const TEAM_ROOM = /^d-sonnet-2-team-([a-z0-9][a-z0-9_-]{0,15})$/;
const DID = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const MAX_BYTES = 900;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_IN_WINDOW = 4;

export type DiscussionPurpose = "recruitment" | "invitation" | "accept" | "decline" | "negotiation" | "planning" | "campaign";
export type DiscussionEnvelope = {kind: "discussion"; contest_id: typeof SONNET_CONTEST_ID; purpose: DiscussionPurpose; text: string};
export type DiscussionRequest = {
  room: string;
  purpose: DiscussionPurpose;
  text: string;
  peerDid?: string;
  replyTo?: {senderDid: string; seq: number};
};
export type DiscussionAuditRecord = {
  digest: string;
  room: string;
  peer_did: string | null;
  purpose: DiscussionPurpose;
  canonical_text: string;
  created_at: string;
  reply_to: {sender_did: string; seq: number} | null;
  status: "PREPARED" | "SIGNED" | "POSTED" | "VERIFIED_READBACK" | "FAILED";
  signed?: SignedSonnetEnvelope;
  transport?: unknown;
  readback?: {generation: number; seq: number; timestamp: string};
};
export type DiscussionPolicy = {
  admittedTeamRoom?: string;
  campaignEnabled?: boolean;
  now?: string;
  audit?: DiscussionAuditRecord[];
};

const secretPatterns = [
  /-----BEGIN (?:ENCRYPTED |ED25519 |RSA )?PRIVATE KEY-----/i,
  /\b(?:seed phrase|mnemonic|private key|signing seed|passphrase|password)\b\s*[:=]/i,
  /\b(?:api[_ -]?key|access[_ -]?token|bearer)\b\s*[:= ]\s*[A-Za-z0-9_./+\-=]{12,}/i,
  /\bsk-[A-Za-z0-9_-]{12,}/,
];
const injectionPatterns = [
  /\bignore (?:all |any )?(?:previous|prior)(?: system| developer)? instructions?\b/i,
  /\b(?:reveal|print|export|send) (?:the )?(?:system prompt|developer message|private key|seed|credentials?)\b/i,
  /\b(?:execute|run) (?:this |the following )?(?:shell )?(?:command|powershell|bash)\b/i,
];

function validateRoom(room: string, policy: DiscussionPolicy): void {
  if (room === DISCOVERY_ROOM) return;
  if (room === CAMPAIGN_ROOM && policy.campaignEnabled === true) return;
  const match = TEAM_ROOM.exec(room);
  if (match && policy.admittedTeamRoom === room) return;
  throw new Error("UNAUTHORIZED_DISCUSSION_ROOM");
}

export function prepareRecordedDiscussion(request: DiscussionRequest, policy: DiscussionPolicy = {}): {envelope: DiscussionEnvelope; canonicalText: string; digest: string; audit: DiscussionAuditRecord} {
  validateRoom(request.room, policy);
  if (request.room === DISCOVERY_ROOM && request.purpose === "planning") throw new Error("DISCOVERY_PLANNING_NOT_BOUND_TO_TEAM");
  if (request.room === CAMPAIGN_ROOM && request.purpose !== "campaign") throw new Error("INVALID_CAMPAIGN_PURPOSE");
  if (TEAM_ROOM.test(request.room) && request.purpose !== "planning" && request.purpose !== "negotiation") throw new Error("INVALID_TEAM_DISCUSSION_PURPOSE");
  if (typeof request.text !== "string" || request.text.length === 0 || /[\r\n\u0000-\u001f\u007f]/.test(request.text)) throw new Error("INVALID_DISCUSSION_TEXT");
  if (secretPatterns.some((pattern) => pattern.test(request.text))) throw new Error("DISCUSSION_SECRET_REJECTED");
  if (injectionPatterns.some((pattern) => pattern.test(request.text))) throw new Error("DISCUSSION_PROMPT_INJECTION_REJECTED");
  if (request.peerDid !== undefined) {
    if (!DID.test(request.peerDid)) throw new Error("INVALID_DISCUSSION_PEER");
    if (request.peerDid === SONNET_WRITER_DID) throw new Error("DISCUSSION_SELF_MESSAGE_REJECTED");
  }
  if (request.replyTo) {
    if (!DID.test(request.replyTo.senderDid) || request.replyTo.senderDid === SONNET_WRITER_DID || !Number.isSafeInteger(request.replyTo.seq) || request.replyTo.seq < 1) throw new Error("INVALID_DISCUSSION_REPLY");
    if (request.peerDid && request.replyTo.senderDid !== request.peerDid) throw new Error("DISCUSSION_REPLY_PEER_MISMATCH");
  } else if (["accept", "decline", "negotiation"].includes(request.purpose)) throw new Error("DISCUSSION_REPLY_REQUIRED");
  const envelope: DiscussionEnvelope = {kind: "discussion", contest_id: SONNET_CONTEST_ID, purpose: request.purpose, text: request.text};
  const canonicalText = canonicalSonnetJson(envelope);
  if (Buffer.byteLength(canonicalText, "utf8") > MAX_BYTES) throw new Error("DISCUSSION_TOO_LARGE");
  const digest = createHash("sha256").update(`${request.room}\0${canonicalText}`, "utf8").digest("hex");
  const audit = policy.audit ?? [];
  if (audit.some((record) => record.digest === digest)) throw new Error("DISCUSSION_DUPLICATE");
  const now = policy.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("INVALID_DISCUSSION_TIME");
  const recent = audit.filter((record) => record.status !== "FAILED" && record.room === request.room && nowMs - Date.parse(record.created_at) >= 0 && nowMs - Date.parse(record.created_at) < WINDOW_MS);
  if (recent.length >= MAX_IN_WINDOW) throw new Error("DISCUSSION_RATE_LIMITED");
  if (request.replyTo && audit.some((record) => record.reply_to?.sender_did === request.replyTo?.senderDid && record.reply_to?.seq === request.replyTo?.seq && record.status !== "FAILED")) throw new Error("DISCUSSION_REPLY_LOOP_REJECTED");
  return {envelope, canonicalText, digest, audit: {digest, room: request.room, peer_did: request.peerDid ?? null, purpose: request.purpose, canonical_text: canonicalText, created_at: now, reply_to: request.replyTo ? {sender_did: request.replyTo.senderDid, seq: request.replyTo.seq} : null, status: "PREPARED"}};
}

export class RecordedDiscussionCapability {
  constructor(private readonly boundary: AuthenticatedDidSignerBoundary) {}
  async did(): Promise<string> {
    const did = await this.boundary.did();
    if (did !== SONNET_WRITER_DID) throw new Error("SONNET_SIGNER_DID_MISMATCH");
    return did;
  }
  async signDiscussion(request: DiscussionRequest, policy: DiscussionPolicy = {}): Promise<{signed: SignedSonnetEnvelope; audit: DiscussionAuditRecord}> {
    const prepared = prepareRecordedDiscussion(request, policy);
    const did = await this.did();
    const signed = await this.boundary.signRoomMessage(request.room, prepared.canonicalText);
    if (signed.did !== did || signed.room !== request.room || signed.text !== prepared.canonicalText) throw new Error("SONNET_SIGNER_INVALID_ENVELOPE");
    return {signed, audit: {...prepared.audit, status: "SIGNED", signed}};
  }
}
