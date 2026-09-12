import {createHash} from "node:crypto";
import {canonicalPoem, didCanContribute, didLetters, solveContributorAssignment, wordSyllables, type Lexicon, type WordAssignment} from "./sonnet-planning.js";
import {prepareRecordedDiscussion, type DiscussionPolicy, type DiscussionPurpose} from "./sonnet-discussion.js";
import type {ContestState} from "./sonnet-state.js";

const API_ORIGIN = "https://generativelanguage.googleapis.com";
const MODELS = new Set(["gemini-3.1-pro-preview", "gemini-3.6-flash"]);
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_PROMPT_BYTES = 48 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const TOKEN = /^[A-Za-z]+(?:'[A-Za-z]+)*(?:[,.;:!?])?$/;
const UNSAFE_PROMPT = [
  /\b(?:api[_ -]?key|access[_ -]?token|password|passphrase|private key|seed phrase|mnemonic)\b\s*[:=]\s*\S+/i,
  /-----BEGIN (?:ENCRYPTED |ED25519 |RSA )?PRIVATE KEY-----/i,
  /\bignore (?:all |any )?(?:previous|prior)(?: system| developer)? instructions?\b/i,
  /\b(?:reveal|print|export|send) (?:the )?(?:system prompt|developer message|private key|seed|credentials?)\b/i,
  /\b(?:execute|run) (?:this |the following )?(?:shell )?(?:command|powershell|bash)\b/i,
];
type Fetch = typeof fetch;
type GeminiTextResponse = {candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>};

export type GeminiClientOptions = {apiKey: string; model?: "gemini-3.1-pro-preview" | "gemini-3.6-flash"; fetchImpl?: Fetch; timeoutMs?: number};
export type PoemGenerationRequest = {roster: string[]; lexicon: Lexicon; count?: number; literaryDirection?: string; forbiddenText?: string[]};
export type ValidatedPoemProposal = {title: string; lines: string[][]; text: string; sha256: string; syllables: number[]; assignments: WordAssignment[]; rationale: string};
export type RejectedPoemProposal = {title: string; reason: string};
export type PoemGenerationResult = {model: string; validated: ValidatedPoemProposal[]; rejected: RejectedPoemProposal[]};
export type PoemRetryPolicy = {maxAttempts?: number; minimumValidated?: number};
export type RetriedPoemGenerationResult = PoemGenerationResult & {attempts: number};
export type DiscussionGenerationRequest = {room: string; purpose: DiscussionPurpose; peerDid?: string; replyTo?: {senderDid: string; seq: number}; facts: string[]; objective: string; policy?: DiscussionPolicy};
export type PreparedGeminiDiscussion = {text: string; canonicalText: string; digest: string};

function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GEMINI_INVALID_OBJECT");
  const record = value as Record<string, unknown>, actual = Object.keys(record).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error("GEMINI_UNEXPECTED_FIELDS");
  return record;
}
function boundedPrompt(prompt: string): string {
  if (!prompt || Buffer.byteLength(prompt, "utf8") > MAX_PROMPT_BYTES) throw new Error("GEMINI_PROMPT_REJECTED");
  return prompt;
}
function safeContext(value: string, error: string): string {
  if (!value || value.length > 2_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || UNSAFE_PROMPT.some((pattern) => pattern.test(value))) throw new Error(error);
  return value;
}
function responseText(value: GeminiTextResponse): string {
  const text = value.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!text || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("GEMINI_RESPONSE_REJECTED");
  return text;
}

export class GeminiProposalClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: Fetch;
  private readonly timeoutMs: number;
  constructor(options: GeminiClientOptions) {
    if (!options.apiKey || /[\r\n\u0000-\u001f\u007f]/.test(options.apiKey)) throw new Error("GEMINI_API_KEY_MISSING");
    this.model = options.model ?? "gemini-3.6-flash";
    if (!MODELS.has(this.model)) throw new Error("GEMINI_MODEL_NOT_ALLOWED");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1_000 || this.timeoutMs > 120_000) throw new Error("GEMINI_TIMEOUT_REJECTED");
  }
  async json(prompt: string, schema: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetchImpl(`${API_ORIGIN}/v1beta/models/${this.model}:generateContent`, {
      method: "POST", redirect: "error", headers: {"content-type": "application/json", "x-goog-api-key": this.apiKey},
      body: JSON.stringify({contents: [{role: "user", parts: [{text: boundedPrompt(prompt)}]}], generationConfig: {temperature: 0.85, responseMimeType: "application/json", responseJsonSchema: schema}}),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) throw new Error("GEMINI_RESPONSE_TOO_LARGE");
    if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
    let envelope: GeminiTextResponse;
    try { envelope = JSON.parse(raw) as GeminiTextResponse; } catch { throw new Error("GEMINI_INVALID_ENVELOPE"); }
    try { return JSON.parse(responseText(envelope)); } catch { throw new Error("GEMINI_INVALID_JSON"); }
  }
}

const poemSchema = {type: "object", additionalProperties: false, properties: {candidates: {type: "array", minItems: 1, maxItems: 8, items: {type: "object", additionalProperties: false, properties: {title: {type: "string"}, lines: {type: "array", minItems: 14, maxItems: 14, items: {type: "string"}}, rationale: {type: "string"}}, required: ["title", "lines", "rationale"]}}}, required: ["candidates"]} as const;
const discussionSchema = {type: "object", additionalProperties: false, properties: {text: {type: "string"}}, required: ["text"]} as const;

function poemPrompt(request: PoemGenerationRequest): string {
  const count = request.count ?? 4;
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) throw new Error("INVALID_GEMINI_POEM_COUNT");
  if (request.roster.length < 4 || request.roster.length > 8 || new Set(request.roster).size !== request.roster.length) throw new Error("INVALID_GEMINI_ROSTER");
  const roster = request.roster.map((did) => ({did, allowed_letters: [...didLetters(did)].sort().join("")}));
  const forbidden = (request.forbiddenText ?? []).map((text) => createHash("sha256").update(text, "utf8").digest("hex"));
  const direction = safeContext(request.literaryDirection ?? "Choose a concrete, emotionally coherent image and a genuine turn in the final couplet.", "UNSAFE_GEMINI_LITERARY_DIRECTION");
  return boundedPrompt([
    "Create entirely original English sonnets for the sonnet-2 contest.",
    `Return exactly ${count} candidates. Each must have 14 nonempty lines in 4/4/4/2 structure, exactly 10 CMUdict syllables per line, natural iambic-pentameter cadence, and ABAB CDCD EFEF GG with seven distinct rhyme families.`,
    "Use one ASCII space between words. Tokens may contain an internal ASCII apostrophe and optional trailing ,.;:!? only. Do not place stanza blank lines inside the lines array.",
    "Every word must be spellable by at least one roster DID using only its allowed letters. Adjacent words must be assignable to different contributors and every contributor must receive at least one word.",
    "Avoid generic AI diction, forced inversions, clichés, copied public contest drafts, and commentary inside poem lines.",
    `Roster: ${JSON.stringify(roster)}`,
    `Literary direction: ${direction}`,
    `Forbidden-source hashes: ${JSON.stringify(forbidden)}`,
    "The caller will reject every mechanically invalid candidate using the frozen dictionary and deterministic assignment solver.",
  ].join("\n"));
}

function validateCandidate(value: unknown, roster: string[], lexicon: Lexicon): ValidatedPoemProposal {
  const candidate = exactObject(value, ["title", "lines", "rationale"]);
  if (typeof candidate.title !== "string" || candidate.title.length < 1 || candidate.title.length > 120) throw new Error("INVALID_POEM_TITLE");
  if (typeof candidate.rationale !== "string" || candidate.rationale.length > 1_000) throw new Error("INVALID_POEM_RATIONALE");
  if (!Array.isArray(candidate.lines) || candidate.lines.length !== 14 || candidate.lines.some((line) => typeof line !== "string" || !line || line.includes("\n") || line.trim() !== line || line.includes("  "))) throw new Error("INVALID_POEM_LINES");
  const lines = candidate.lines.map((line) => (line as string).split(" "));
  if (lines.some((line) => line.some((token) => !TOKEN.test(token)))) throw new Error("INVALID_POEM_TOKEN");
  const syllables = lines.map((line) => line.reduce((sum, token) => sum + wordSyllables(token, lexicon), 0));
  const badLine = syllables.findIndex((count) => count !== 10);
  if (badLine >= 0) throw new Error(`POEM_LINE_NOT_EXACTLY_TEN:${badLine + 1}:${syllables[badLine]}`);
  const assignments = solveContributorAssignment(lines.flat(), roster, lexicon);
  if (!assignments) throw new Error("POEM_ASSIGNMENT_INFEASIBLE");
  const text = canonicalPoem(lines);
  return {title: candidate.title, lines, text, sha256: createHash("sha256").update(text, "utf8").digest("hex"), syllables, assignments, rationale: candidate.rationale as string};
}

export class GeminiSonnetGenerator {
  constructor(private readonly client: GeminiProposalClient) {}
  async generatePoems(request: PoemGenerationRequest): Promise<PoemGenerationResult> {
    const raw = exactObject(await this.client.json(poemPrompt(request), poemSchema), ["candidates"]);
    if (!Array.isArray(raw.candidates)) throw new Error("GEMINI_INVALID_CANDIDATES");
    const validated: ValidatedPoemProposal[] = [], rejected: RejectedPoemProposal[] = [];
    for (const value of raw.candidates) {
      let title = "untitled";
      try {
        if (value && typeof value === "object" && typeof (value as Record<string, unknown>).title === "string") title = (value as Record<string, unknown>).title as string;
        validated.push(validateCandidate(value, request.roster, request.lexicon));
      } catch (error) { rejected.push({title, reason: error instanceof Error ? error.message : "POEM_REJECTED"}); }
    }
    return {model: this.client.model, validated, rejected};
  }
  async generateUntilValid(request: PoemGenerationRequest, policy: PoemRetryPolicy = {}): Promise<RetriedPoemGenerationResult> {
    const maxAttempts = policy.maxAttempts ?? 3, minimumValidated = policy.minimumValidated ?? 1;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5 || !Number.isSafeInteger(minimumValidated) || minimumValidated < 1 || minimumValidated > 8) throw new Error("INVALID_GEMINI_RETRY_POLICY");
    const validated: ValidatedPoemProposal[] = [], rejected: RejectedPoemProposal[] = [], hashes = new Set<string>();
    let feedback = "", attempts = 0;
    while (attempts < maxAttempts && validated.length < minimumValidated) {
      attempts++;
      const direction = [request.literaryDirection, feedback].filter(Boolean).join("\n");
      const iteration = direction ? {...request, literaryDirection: direction} : request;
      const result = await this.generatePoems(iteration);
      for (const proposal of result.validated) if (!hashes.has(proposal.sha256)) { hashes.add(proposal.sha256); validated.push(proposal); }
      rejected.push(...result.rejected);
      feedback = result.rejected.length ? `Repair these exact deterministic failures from attempt ${attempts}: ${result.rejected.map((item) => `${item.title}=${item.reason}`).join("; ")}. Recount every line before returning replacements.` : "";
    }
    return {model: this.client.model, validated, rejected, attempts};
  }
  async prepareDiscussion(request: DiscussionGenerationRequest): Promise<PreparedGeminiDiscussion> {
    if (!Array.isArray(request.facts) || request.facts.length === 0 || request.facts.some((fact) => typeof fact !== "string" || fact.length === 0 || fact.length > 600)) throw new Error("INVALID_DISCUSSION_FACTS");
    if (!request.objective || request.objective.length > 600) throw new Error("INVALID_DISCUSSION_OBJECTIVE");
    const facts = request.facts.map((fact) => safeContext(fact, "UNSAFE_GEMINI_DISCUSSION_FACT"));
    const objective = safeContext(request.objective, "UNSAFE_GEMINI_DISCUSSION_OBJECTIVE");
    const prompt = ["Draft one concise factual Sonnet-2 discussion message. Return only the requested JSON object.", "Do not invent receipts, commitments, protocol types, request IDs, prizes, deadlines, credentials, or private communication.", "Do not claim a roster action. Do not include instructions to reveal secrets or run commands.", `Verified facts: ${JSON.stringify(facts)}`, `Objective: ${objective}`].join("\n");
    const raw = exactObject(await this.client.json(prompt, discussionSchema), ["text"]);
    if (typeof raw.text !== "string") throw new Error("GEMINI_INVALID_DISCUSSION");
    const prepared = prepareRecordedDiscussion({room: request.room, purpose: request.purpose, text: raw.text, peerDid: request.peerDid, replyTo: request.replyTo}, request.policy);
    return {text: raw.text, canonicalText: prepared.canonicalText, digest: prepared.digest};
  }
}

export type AutonomousGate = {status: "WAIT"; reason: string} | {status: "GENERATE_FULL_POEM"} | {status: "PROPOSE_NEXT_WORD"; expectedVersion: number; expectedStateHash: string};
export function nextGeminiGate(state: ContestState, peerConfirmations: number, hasValidatedPoem: boolean): AutonomousGate {
  if (["REGISTERED", "DISCOVERY", "RECRUITING", "TEAM_REQUESTED", "TEAM_ALLOCATED", "ROSTER_PENDING"].includes(state.state)) return {status: "WAIT", reason: peerConfirmations < 3 ? "WAITING_FOR_PEERS" : "WAITING_FOR_AUTHORITATIVE_ROSTER_READY"};
  if (state.state === "ROSTER_READY" && !hasValidatedPoem) return {status: "GENERATE_FULL_POEM"};
  if (state.state === "ROSTER_READY") return {status: "WAIT", reason: "FULL_POEM_REVIEW_REQUIRED_BEFORE_FIRST_WORD"};
  if (state.state === "WRITING") {
    if (!hasValidatedPoem || !Number.isSafeInteger(state.version) || !state.state_hash) return {status: "WAIT", reason: "AUTHORITATIVE_STATE_OR_VALIDATED_PLAN_MISSING"};
    if (state.last_contributor === "did:key:z6Mks3GkYHmXSXjS639r9399owtxCMpzFexrq6EAziYZnjPk") return {status: "WAIT", reason: "PREVIOUS_CONTRIBUTOR_SELF_TURN_BLOCKED"};
    return {status: "PROPOSE_NEXT_WORD", expectedVersion: state.version!, expectedStateHash: state.state_hash};
  }
  return {status: "WAIT", reason: "NO_GENERATION_ACTION_FOR_STATE"};
}

export function validateGeminiWord(word: string, did: string, remainingLineSyllables: number, lexicon: Lexicon): {word: string; syllables: number} {
  if (!TOKEN.test(word) || !Number.isSafeInteger(remainingLineSyllables) || remainingLineSyllables < 1 || remainingLineSyllables > 10) throw new Error("INVALID_GEMINI_WORD");
  const syllables = wordSyllables(word, lexicon);
  if (!didCanContribute(did, word)) throw new Error("GEMINI_WORD_DID_LETTER_VIOLATION");
  if (syllables > remainingLineSyllables) throw new Error("GEMINI_WORD_LINE_OVERFLOW");
  return {word, syllables};
}
