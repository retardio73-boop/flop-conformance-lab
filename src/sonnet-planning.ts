import {createHash} from "node:crypto";

const WORD = /^[A-Za-z]+(?:'[A-Za-z]+)*$/;
const TOKEN = /^([A-Za-z]+(?:'[A-Za-z]+)*)[,.;:!?]?$/;
const VOWELS = new Set(["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"]);
export type Lexicon = Map<string, number>;
export type WordAssignment = {token: string; contributor: string; syllables: number};
export type CandidateCoverage = {did: string; allowed_letters: string; word_count: number; one_syllable: number; two_syllable: number; three_plus_syllable: number; function_words: string[]; rhyme_words: string[]};

export function readCmuLexicon(text: string): Lexicon {
  const counts: Lexicon = new Map();
  for (const entry of text.split(/\r?\n/)) {
    const fields = entry.split("#", 1)[0]!.trim().split(/\s+/);
    if (!fields[0] || fields[0].startsWith(";;;")) continue;
    const word = fields[0].replace(/\(\d+\)$/, "").toLowerCase();
    if (!WORD.test(word)) continue;
    const count = fields.slice(1).filter((phone) => VOWELS.has(phone.slice(0, -1)) && /^[012]$/.test(phone.slice(-1))).length;
    if (count > 0) counts.set(word, Math.max(counts.get(word) ?? 0, count));
  }
  if (counts.size === 0) throw new Error("CMUDICT_EMPTY");
  return counts;
}
export function wordSyllables(token: string, lexicon: Lexicon): number { const match = TOKEN.exec(token); if (!match) throw new Error("INVALID_POEM_WORD"); const count = lexicon.get(match[1]!.toLowerCase()); if (!count) throw new Error("WORD_NOT_IN_FROZEN_CMUDICT"); return count; }
export function didLetters(did: string): Set<string> { return new Set([...did.toLowerCase()].filter((letter) => letter >= "a" && letter <= "z")); }
export function didCanContribute(did: string, token: string): boolean { const allowed = didLetters(did); return [...token.toLowerCase()].filter((letter) => letter >= "a" && letter <= "z").every((letter) => allowed.has(letter)); }
const FUNCTION_WORDS = ["a", "an", "and", "as", "at", "but", "by", "for", "from", "if", "in", "is", "it", "nor", "not", "of", "on", "or", "so", "that", "the", "to", "when", "with", "yet", "you"];
export function candidateCoverage(did: string, lexicon: Lexicon, rhymeCandidates: Iterable<string> = []): CandidateCoverage {
  let wordCount = 0, one = 0, two = 0, three = 0;
  for (const [word, syllables] of lexicon) if (didCanContribute(did, word)) { wordCount++; if (syllables === 1) one++; else if (syllables === 2) two++; else three++; }
  return {did, allowed_letters: [...didLetters(did)].sort().join(""), word_count: wordCount, one_syllable: one, two_syllable: two, three_plus_syllable: three, function_words: FUNCTION_WORDS.filter((word) => lexicon.has(word) && didCanContribute(did, word)), rhyme_words: [...rhymeCandidates].filter((word) => lexicon.has(word.toLowerCase()) && didCanContribute(did, word))};
}
export function solveContributorAssignment(tokens: string[], roster: string[], lexicon: Lexicon, previousContributor?: string): WordAssignment[] | null {
  if (roster.length < 4 || roster.length > 8 || new Set(roster).size !== roster.length) throw new Error("INVALID_SOLVER_ROSTER");
  const domains = tokens.map((token) => roster.filter((did) => didCanContribute(did, token)));
  if (domains.some((domain) => domain.length === 0)) return null;
  const assignments: WordAssignment[] = [], used = new Set<string>();
  const search = (index: number, last?: string): boolean => {
    if (index === tokens.length) return used.size === roster.length;
    if (roster.filter((did) => !used.has(did)).length > tokens.length - index) return false;
    for (const did of [...domains[index]!].sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || a.localeCompare(b))) {
      if (did === last) continue;
      const token = tokens[index]!; const wasUsed = used.has(did); used.add(did); assignments.push({token, contributor: did, syllables: wordSyllables(token, lexicon)});
      if (search(index + 1, did)) return true;
      assignments.pop(); if (!wasUsed) used.delete(did);
    }
    return false;
  };
  return search(0, previousContributor) ? assignments : null;
}
export function canonicalPoem(lines: string[][]): string { if (lines.length !== 14 || lines.some((line) => line.length === 0)) throw new Error("POEM_REQUIRES_14_NONEMPTY_LINES"); return lines.map((line) => line.join(" ")).map((line, index) => [3, 7, 11].includes(index) ? `${line}\n` : line).join("\n"); }
export function validateMechanicalPoem(lines: string[][], roster: string[], contributors: string[], lexicon: Lexicon): {text: string; sha256: string; syllables: number[]} {
  const tokens = lines.flat();
  if (tokens.length !== contributors.length) throw new Error("CONTRIBUTION_LEDGER_LENGTH_MISMATCH");
  if (contributors.some((did) => !roster.includes(did)) || roster.some((did) => !contributors.includes(did))) throw new Error("ROSTER_CONTRIBUTION_REQUIREMENT_FAILED");
  for (let index = 0; index < tokens.length; index++) { if (!didCanContribute(contributors[index]!, tokens[index]!)) throw new Error("DID_LETTER_VIOLATION"); if (index > 0 && contributors[index] === contributors[index - 1]) throw new Error("ADJACENT_CONTRIBUTOR_VIOLATION"); }
  const syllables = lines.map((line) => line.reduce((sum, token) => sum + wordSyllables(token, lexicon), 0));
  if (syllables.some((count) => count !== 10)) throw new Error("POEM_LINE_NOT_EXACTLY_TEN");
  const text = canonicalPoem(lines); return {text, sha256: createHash("sha256").update(text, "utf8").digest("hex"), syllables};
}
export function reconstructXThread(parts: string[]): string { if (parts.length === 0 || parts.some((part) => part.length === 0 || part.endsWith("\n") || part.startsWith("\n"))) throw new Error("INVALID_X_THREAD_PART"); const text = parts.join("\n"); if (text.endsWith("\n")) throw new Error("INVALID_X_THREAD_TERMINATOR"); return text; }
