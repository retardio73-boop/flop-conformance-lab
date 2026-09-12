# Gemini proposal engine for Sonnet-2

`GeminiSonnetGenerator` is an optional, proposal-only component. It can draft bounded discussion and generate complete poem candidates, but it has no signer, Technocore writer, X client, key-storage API, or protocol-state mutation method.

The client uses the fixed Google Generative Language origin and sends `GEMINI_API_KEY` only in the request header. The key is never included in prompts, results, audit state, or repository files. Allowed models are explicitly enumerated; `gemini-3.6-flash` is the default and `gemini-3.1-pro-preview` can be selected when its quota is available.

Every poem candidate is rejected unless local deterministic checks establish:

- 14 nonempty lines;
- exactly ten frozen-CMUdict syllables per line;
- legal Sonnet word grammar;
- a legal contributor for every token;
- no adjacent repeated contributor; and
- at least one contribution from every proposed roster member.

`generateUntilValid` retries generation at most five times and feeds only deterministic failure descriptions back to Gemini. A valid proposal is still planning evidence, not contest state. It cannot authorize a roster, first word, publication, or submission.

`nextGeminiGate` keeps automation paused while peers, room setup, matching roster consents, or the authoritative roster-ready receipt are absent. Even after roster readiness, it requires a validated full poem before exposing a next-word proposal gate. The existing Sonnet capability remains the only path to signing official actions.

Minimal programmatic use:

```js
import {GeminiProposalClient, GeminiSonnetGenerator, readCmuLexicon} from "@flop-tools/conformance-lab";

const client = new GeminiProposalClient({apiKey: process.env.GEMINI_API_KEY});
const generator = new GeminiSonnetGenerator(client);
const result = await generator.generateUntilValid({roster, lexicon: readCmuLexicon(cmudict), count: 4});
```

Persist accepted proposals only in ignored local state such as `sonnet/state/private/`. Reconstruct assignments deterministically from the frozen dictionary before use, and refresh authoritative contest state before every signed action.
