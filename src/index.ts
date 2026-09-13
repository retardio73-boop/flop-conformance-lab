import { readFileSync } from "node:fs";
import { coreSuites, routerSuite } from "./suites.js";
import { validateQuoteChannelReceiptFixture } from "./flop-quote-boundary.js";
import { runAdversarialEvidenceFixture } from "./adversarial-evidence.js";
import { validateYellowpaper5657Fixture } from "./yellowpaper-open-issues.js";
import { validateDemandIndependenceFixture } from "./demand-independence.js";
import { validateSybilEconomicsFixture } from "./sybil-economics.js";
import type { LabReport } from "./types.js";

export * from "./types.js";
export * from "./technocore.js";
export * from "./boundary.js";
export * from "./signing.js";
export * from "./protocol-ids.js";
export * from "./differential.js";
export * from "./flop-quote-boundary.js";
export * from "./adversarial-evidence.js";
export * from "./yellowpaper-open-issues.js";
export * from "./demand-independence.js";
export * from "./sybil-economics.js";
export * from "./tclk-provisional-hardening.js";
export * from "./work-evidence.js";
export * from "./technocore-recovery.js";
export * from "./contactability.js";
export * from "./sonnet.js";
export * from "./sonnet-discussion.js";
export * from "./sonnet-planning.js";
export * from "./sonnet-state.js";
export * from "./profiles.js";

function packageVersion(): string {
  const metadata = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };

  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("PACKAGE_VERSION_UNAVAILABLE");
  }

  return metadata.version;
}

export async function runLab(routerModule?: string): Promise<LabReport> {
  const quoteFixture = validateQuoteChannelReceiptFixture();
  const adversarialEvidence = runAdversarialEvidenceFixture();
  const yellowpaper5657 = validateYellowpaper5657Fixture();
  const demandIndependence = validateDemandIndependenceFixture();
  const sybilEconomics = validateSybilEconomicsFixture();
  const d0440Conflict = JSON.parse(
    readFileSync(
      new URL("../conformance/fixtures/flop-d0440-source-conflict.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const technocore842 = JSON.parse(
    readFileSync(
      new URL("../conformance/fixtures/technocore-842-recovery-boundary.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const cases = [
    ...(await coreSuites()),
    ...(await routerSuite(routerModule)),
    {
      id: "evidence.adversarial-suite-v1",
      suite: "evidence",
      status: "PASS" as const,
      normativeStatus: "LOCAL_POLICY" as const,
      durationMs: 0,
      details: adversarialEvidence,
    },
    {
      id: "flop.quote-open-channel-receipt",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "TARGET_SPEC" as const,
      durationMs: 0,
      details: quoteFixture,
    },
    {
      id: "flop.yellowpaper-56-57-boundaries",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "OPEN_ISSUE" as const,
      durationMs: 0,
      details: yellowpaper5657,
    },
    {
      id: "flop.e49-demand-independence",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "OPEN_ISSUE" as const,
      durationMs: 0,
      details: demandIndependence,
    },
    {
      id: "flop.issue-58-sybil-economics",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "OPEN_ISSUE" as const,
      durationMs: 0,
      details: sybilEconomics,
    },
    {
      id: "flop.d0440-official-source-conflict",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "OPEN_ISSUE" as const,
      durationMs: 0,
      details: d0440Conflict,
    },
    {
      id: "technocore.pr842-bounded-recovery",
      suite: "technocore",
      status: "PASS" as const,
      normativeStatus: "PROVISIONAL_PR" as const,
      durationMs: 0,
      details: technocore842,
    },
  ];

  return {
    version: packageVersion(),
    generatedAt: new Date().toISOString(),
    summary: {
      pass: cases.filter((item) => item.status === "PASS").length,
      fail: cases.filter((item) => item.status === "FAIL").length,
      skip: cases.filter((item) => item.status === "SKIP").length,
    },
    lanes: {
      RELEASE_CONFORMANCE: "ACTIVE",
      UPSTREAM_CONFORMANCE: "MANIFEST_ONLY",
      TARGET_SPEC_CONFORMANCE: "ACTIVE",
      LIVE_CONFORMANCE: "PUBLIC_RUNTIME_UNAVAILABLE",
    },
    cases,
    sources: JSON.parse(
      readFileSync(
        new URL("../conformance/sources/manifest.json", import.meta.url),
        "utf8",
      ),
    ),
  };
}
