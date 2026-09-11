export const SONNET_CONTEST_ID = "sonnet-2" as const;
export const SONNET_WRITER_DID = "did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk" as const;
export const SONNET_REFEREE_DID = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte" as const;
export const SONNET_IDENTITY_CUTOFF = "2026-09-11T12:00:00Z" as const;
export const SONNET_DEADLINE = "2026-09-18T12:00:00Z" as const;

export const SONNET_SHARED_ROOMS = new Set([
  "mb-sonnet-2-registration",
  "mb-sonnet-2-discovery",
  "mb-sonnet-2-campaign",
  "mb-sonnet-2-votes",
  "mb-sonnet-2-submissions",
]);

export const SONNET_ALLOWED_TYPES = new Set([
  "sonnet.register.v1",
  "sonnet.team-request.v1",
  "sonnet.roster.v1",
  "sonnet.withdraw.v1",
  "sonnet.word.v1",
  "sonnet.submit.v1",
  "sonnet.ballot.v1",
  "sonnet.claim.v1",
  "sonnet.invite.v1",
  "sonnet.reply.v1",
]);

export type SonnetAction = { room: string; payload: Record<string, unknown>; canonicalPayload: string };
export type SignedSonnetEnvelope = { did: string; room: string; nonce: string; text: string; signature: string };

export interface AuthenticatedDidSignerBoundary {
  did(): Promise<string>;
  signRoomMessage(room: string, text: string): Promise<SignedSonnetEnvelope>;
}

const GAME_ID = /^[a-z0-9][a-z0-9_-]{0,15}$/;
const TEAM_ROOM = /^d-sonnet-2-team-([a-z0-9][a-z0-9_-]{0,15})$/;
const DID = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const REQUEST_ID = /^[\x21-\x7e]{1,128}$/;
const HASH = /^(?:sha256:)?[0-9a-f]{64}$/;
const X_ACCOUNT = /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/;
const WORD = /^[A-Za-z]+(?:'[A-Za-z]+)*[,.;:!?]?$/;
const NONCE = /^(?:0|[1-9][0-9]{0,18})$/;
const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

const lexical = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function canonicalSonnetJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("NON_CANONICAL_NUMBER");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSonnetJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => lexical(a, b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalSonnetJson(item)}`).join(",")}}`;
  }
  throw new Error("NON_CANONICAL");
}

function exactKeys(payload: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(payload).sort(lexical);
  const expected = [...keys].sort(lexical);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error("INVALID_SONNET_SCHEMA");
}

function requireString(value: unknown, name: string, maximum = 4096): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\r\n\u0000-\u001f\u007f]/.test(value)) throw new Error(`INVALID_${name}`);
}

function requireInteger(value: unknown, name: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error(`INVALID_${name}`);
}

function requireRequestId(value: unknown): void {
  if (typeof value !== "string" || !REQUEST_ID.test(value)) throw new Error("INVALID_REQUEST_ID");
}

function requireGameId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !GAME_ID.test(value)) throw new Error("INVALID_GAME_ID");
}

function requireDid(value: unknown, name: string): void {
  if (typeof value !== "string" || !DID.test(value)) throw new Error(`INVALID_${name}`);
}

function validateSchema(payload: Record<string, unknown>): void {
  const type = payload.type;
  if (type === "sonnet.register.v1") {
    if (payload.role === "writer") {
      exactKeys(payload, ["type", "contest_id", "role", "x_account_url", "request_id"]);
      if (typeof payload.x_account_url !== "string" || !X_ACCOUNT.test(payload.x_account_url)) throw new Error("INVALID_X_ACCOUNT_URL");
    } else if (payload.role === "voter" || payload.role === "organizer") {
      exactKeys(payload, ["type", "contest_id", "role", "request_id"]);
    } else throw new Error("INVALID_ROLE");
  } else if (type === "sonnet.team-request.v1" || type === "sonnet.withdraw.v1") {
    exactKeys(payload, ["type", "contest_id", "game_id", "request_id"]);
    requireGameId(payload.game_id);
  } else if (type === "sonnet.roster.v1") {
    exactKeys(payload, ["type", "contest_id", "game_id", "poem_room", "room_generation", "members", "request_id"]);
    requireGameId(payload.game_id);
    if (payload.poem_room !== `d-sonnet-2-team-${payload.game_id}`) throw new Error("INVALID_POEM_ROOM");
    requireInteger(payload.room_generation, "ROOM_GENERATION");
    if (!Array.isArray(payload.members) || payload.members.length < 4 || payload.members.length > 8) throw new Error("INVALID_MEMBERS");
    payload.members.forEach((member) => requireDid(member, "MEMBER_DID"));
    if (new Set(payload.members).size !== payload.members.length) throw new Error("DUPLICATE_MEMBER_DID");
  } else if (type === "sonnet.word.v1") {
    exactKeys(payload, ["type", "contest_id", "game_id", "room_generation", "version", "previous_state_hash", "word", "request_id"]);
    requireGameId(payload.game_id);
    requireInteger(payload.room_generation, "ROOM_GENERATION");
    requireInteger(payload.version, "VERSION");
    if (typeof payload.previous_state_hash !== "string" || !HASH.test(payload.previous_state_hash)) throw new Error("INVALID_PREVIOUS_STATE_HASH");
    if (typeof payload.word !== "string" || !WORD.test(payload.word)) throw new Error("INVALID_WORD");
  } else if (type === "sonnet.submit.v1") {
    exactKeys(payload, ["type", "contest_id", "game_id", "poem_room", "room_generation", "final_version", "poem_sha256", "x_post_ids", "request_id"]);
    requireGameId(payload.game_id);
    if (payload.poem_room !== `d-sonnet-2-team-${payload.game_id}`) throw new Error("INVALID_POEM_ROOM");
    requireInteger(payload.room_generation, "ROOM_GENERATION");
    requireInteger(payload.final_version, "FINAL_VERSION", 1);
    if (typeof payload.poem_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(payload.poem_sha256)) throw new Error("INVALID_POEM_SHA256");
    if (!Array.isArray(payload.x_post_ids) || payload.x_post_ids.length === 0 || payload.x_post_ids.some((id) => typeof id !== "string" || !/^[0-9]{1,32}$/.test(id))) throw new Error("INVALID_X_POST_IDS");
  } else if (type === "sonnet.ballot.v1") {
    exactKeys(payload, ["type", "contest_id", "voter_did", "entry_id", "request_id"]);
    requireDid(payload.voter_did, "VOTER_DID");
    requireString(payload.entry_id, "ENTRY_ID", 128);
  } else if (type === "sonnet.claim.v1") {
    exactKeys(payload, ["type", "contest_id", "request_id", "destination"]);
    requireString(payload.destination, "DESTINATION", 512);
  } else if (type === "sonnet.invite.v1") {
    exactKeys(payload, ["type", "contest_id", "purpose", "target_did", "entry_id", "request_id", "text"]);
    if (payload.purpose !== "vote") throw new Error("INVALID_INVITE_PURPOSE");
    requireDid(payload.target_did, "TARGET_DID");
    requireString(payload.entry_id, "ENTRY_ID", 128);
    requireString(payload.text, "INVITE_TEXT", 512);
  } else if (type === "sonnet.reply.v1") {
    exactKeys(payload, ["type", "contest_id", "in_reply_to", "request_id", "text"]);
    requireString(payload.text, "REPLY_TEXT", 512);
    if (!payload.in_reply_to || Array.isArray(payload.in_reply_to) || typeof payload.in_reply_to !== "object") throw new Error("INVALID_IN_REPLY_TO");
    const reply = payload.in_reply_to as Record<string, unknown>;
    exactKeys(reply, ["sender_did", "request_id"]);
    requireDid(reply.sender_did, "REPLY_SENDER_DID");
    requireRequestId(reply.request_id);
  } else throw new Error("UNAUTHORIZED_SONNET_TYPE");
  requireRequestId(payload.request_id);
}

export function isSonnetRoom(room: string): boolean { return SONNET_SHARED_ROOMS.has(room) || TEAM_ROOM.test(room); }

export function validateSonnetAction(input: unknown): SonnetAction {
  if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("INVALID_SONNET_ACTION");
  const action = input as Partial<SonnetAction>;
  if (typeof action.room !== "string" || !action.payload || typeof action.payload !== "object" || Array.isArray(action.payload) || typeof action.canonicalPayload !== "string") throw new Error("INVALID_SONNET_ACTION");
  if (action.room.includes("sonnet-1")) throw new Error("OBSOLETE_CONTEST_NAMESPACE");
  if (!isSonnetRoom(action.room)) throw new Error("UNAUTHORIZED_SONNET_ROOM");
  const type = action.payload.type;
  if (typeof type !== "string" || !SONNET_ALLOWED_TYPES.has(type)) throw new Error("UNAUTHORIZED_SONNET_TYPE");
  if (action.payload.contest_id !== SONNET_CONTEST_ID) throw new Error("WRONG_CONTEST_ID");
  validateSchema(action.payload);
  if (canonicalSonnetJson(action.payload) !== action.canonicalPayload) throw new Error("NON_CANONICAL_SONNET_ACTION");
  if (type === "sonnet.register.v1" && action.room !== "mb-sonnet-2-registration") throw new Error("SONNET_REGISTER_WRONG_ROOM");
  if ((type === "sonnet.team-request.v1" || type === "sonnet.roster.v1" || type === "sonnet.withdraw.v1") && action.room !== "mb-sonnet-2-discovery") throw new Error("SONNET_DISCOVERY_ACTION_WRONG_ROOM");
  if (type === "sonnet.word.v1") { const match = TEAM_ROOM.exec(action.room); if (!match || match[1] !== action.payload.game_id) throw new Error("SONNET_WORD_WRONG_ROOM"); }
  if (type === "sonnet.submit.v1" && action.room !== "mb-sonnet-2-submissions") throw new Error("SONNET_SUBMIT_WRONG_ROOM");
  if (type === "sonnet.ballot.v1" && action.room !== "mb-sonnet-2-votes") throw new Error("SONNET_BALLOT_WRONG_ROOM");
  if (type === "sonnet.claim.v1" && action.room !== "mb-sonnet-2-registration") throw new Error("SONNET_CLAIM_WRONG_ROOM");
  if ((type === "sonnet.invite.v1" || type === "sonnet.reply.v1") && action.room !== "mb-sonnet-2-campaign") throw new Error("SONNET_CAMPAIGN_ACTION_WRONG_ROOM");
  return action as SonnetAction;
}

export class SonnetSignerCapability {
  constructor(private readonly boundary: AuthenticatedDidSignerBoundary) {}
  async did(): Promise<string> { const did = await this.boundary.did(); if (did !== SONNET_WRITER_DID) throw new Error("SONNET_SIGNER_DID_MISMATCH"); return did; }
  async signAction(input: unknown): Promise<SignedSonnetEnvelope> {
    const action = validateSonnetAction(input);
    const did = await this.did();
    const signed = await this.boundary.signRoomMessage(action.room, action.canonicalPayload);
    if (signed.did !== did || signed.room !== action.room || signed.text !== action.canonicalPayload || !NONCE.test(signed.nonce) || !SIGNATURE.test(signed.signature)) throw new Error("SONNET_SIGNER_INVALID_ENVELOPE");
    return signed;
  }
}

export function reuseRegistrationRequest(existing: Record<string, unknown>, candidate: Record<string, unknown>): Record<string, unknown> {
  if (existing.type !== "sonnet.register.v1" || candidate.type !== "sonnet.register.v1") throw new Error("NOT_REGISTRATION_REQUEST");
  if (existing.request_id !== candidate.request_id) throw new Error("REGISTRATION_REQUEST_ID_CHANGED");
  if (canonicalSonnetJson(existing) !== canonicalSonnetJson(candidate)) throw new Error("REGISTRATION_RETRY_CONFLICT");
  return existing;
}

export function assertOfficialReferee(actualDid: string, verifiedRefereeDid = SONNET_REFEREE_DID): void { if (actualDid !== verifiedRefereeDid) throw new Error("WRONG_SONNET_REFEREE"); }
export function verifyPrestartTimestamp(timestamp: string): boolean { const time = Date.parse(timestamp), cutoff = Date.parse(SONNET_IDENTITY_CUTOFF); if (!Number.isFinite(time)) throw new Error("INVALID_RECEIPT_TIMESTAMP"); return time < cutoff; }
export function assertFreshGameId(gameId: string): void { if (!GAME_ID.test(gameId)) throw new Error("INVALID_GAME_ID"); }
