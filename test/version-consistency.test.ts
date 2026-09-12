import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runLab } from "../src/index.js";

test("generated report version matches package metadata", async () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };

  assert.equal(typeof pkg.version, "string");
  const report = await runLab();
  assert.equal(report.version, pkg.version);
});
