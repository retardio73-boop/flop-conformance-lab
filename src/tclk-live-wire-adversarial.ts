import { readFileSync } from "node:fs";
import { tryDecodeFrame } from "@flop-labs/tclk";
import {
  assessSettlementEvidence,
  evaluateRecordTrust,
  extractLosslessTransportNonce,
} from "./adversarial-evidence.js";

type Case = {
  id: string;
  source: string;
  line?: string;
  precondition?: string;
  raw?: string;
  expectedNonce?: string;
  authenticated?: boolean;
  sender?: string;
  text?: string;
  expected: string;
};

type Fixture = {
  schema: string;
  classification: string;
  cases: Case[];
  nonClaims: string[];
};

const FIXTURE_URL = new URL(
  "../conformance/fixtures/tclk-live-wire-adversarial-v1.json",
  import.meta.url,
);

export function validateTclkLiveWireAdversarialFixture(): Record<string, unknown> {
  const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as Fixture;
  if (fixture.schema !== "tclk.live-wire-adversarial.v1") {
    throw new Error("TCLK_LIVE_WIRE_SCHEMA_DIVERGENCE");
  }

  for (const item of fixture.cases) {
    if (item.id === "accept-missing-contract") {
      if (!item.line || tryDecodeFrame(item.line) !== null) {
        throw new Error("TCLK_ACCEPT_MISSING_CONTRACT_NOT_REJECTED");
      }
    } else if (item.id === "reveal-without-lock" || item.id === "receipt-without-lock") {
      const evidence = assessSettlementEvidence({
        rail: "flop-htlc",
        valueBearing: true,
        lockFrameValid: false,
        railReferenceVerified: false,
        railStateVerified: false,
      });
      if (evidence !== "TRANSCRIPT_ONLY") {
        throw new Error(`TCLK_${item.id.toUpperCase().replaceAll("-", "_")}_OVERCLAIM`);
      }
    } else if (item.id === "large-transport-nonce") {
      if (!item.raw || extractLosslessTransportNonce(item.raw) !== item.expectedNonce) {
        throw new Error("TCLK_LARGE_NONCE_PRECISION_LOSS");
      }
    } else if (item.id === "hostile-room-prompt") {
      const decision = evaluateRecordTrust({
        room: "mb-p-tclk-1111111111111111",
        seq: 1,
        sender: item.sender ?? "",
        authenticated: item.authenticated ?? false,
        type: null,
        frameFrom: null,
        frameContract: null,
        text: item.text ?? "",
      }, {
        payer: "did:key:z6Mkpayer",
        payee: "did:key:z6Mkpayee",
        contract: "0x" + "11".repeat(32),
      });
      if (decision.accepted || !decision.reasons.includes("NON_PROTOCOL_TEXT_IGNORED")) {
        throw new Error("TCLK_HOSTILE_PROMPT_NOT_IGNORED");
      }
    }
  }

  return {
    schema: fixture.schema,
    classification: fixture.classification,
    cases: fixture.cases.length,
    sources: fixture.cases.map((item) => item.source),
    nonClaims: fixture.nonClaims,
  };
}
