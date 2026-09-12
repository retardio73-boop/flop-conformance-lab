import { readFileSync } from "node:fs";
import { coreSuites, routerSuite } from "./suites.js";
import { validateQuoteChannelReceiptFixture } from "./flop-quote-boundary.js";
import type { LabReport } from "./types.js";

export * from "./types.js";
export * from "./technocore.js";
export * from "./boundary.js";
export * from "./signing.js";
export * from "./protocol-ids.js";
export * from "./differential.js";
export * from "./flop-quote-boundary.js";
export * from "./sonnet.js";
export * from "./sonnet-discussion.js";
export * from "./sonnet-planning.js";
export * from "./sonnet-state.js";

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
  const cases = [
    ...(await coreSuites()),
    ...(await routerSuite(routerModule)),
    {
      id: "flop.quote-open-channel-receipt",
      suite: "flop",
      status: "PASS" as const,
      normativeStatus: "TARGET_SPEC" as const,
      durationMs: 0,
      details: quoteFixture,
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
