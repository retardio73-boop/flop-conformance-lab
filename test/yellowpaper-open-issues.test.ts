import test from "node:test";
import assert from "node:assert/strict";
import { receiptMessageV1, validateYellowpaper5657Fixture } from "../src/index.js";

test("Yellow Paper #56 keeps payable semantics unresolved and receipt bytes interpretation-sensitive", () => {
  const result = validateYellowpaper5657Fixture();
  assert.equal(result.payableBoundary, "PAYABLE_SEMANTICS_UNRESOLVED");
  assert.equal(result.payableUnit, "UNRESOLVED");
  assert.equal(result.receiptPreimagesDiffer, true);

  const common = {
    channelIdHex: "11".repeat(32),
    finalRootHex: "22".repeat(32),
    aggregateGn: "42",
  };
  assert.notDeepEqual(
    receiptMessageV1({ ...common, payable: "1000" }),
    receiptMessageV1({ ...common, payable: "420" }),
  );
});

test("Yellow Paper #57 pins a plain 64-byte Merkle node preimage with aggregate checked separately", () => {
  const result = validateYellowpaper5657Fixture();
  assert.equal(result.merkleNodeRule, "blake2_256(left || right)");
  assert.equal(result.merkleNodePreimageBytes, 64);
  assert.equal(result.aggregateCheck, "ARITHMETIC_SEPARATE");
});

test("Lab report classifies #56/#57 as OPEN_ISSUE rather than normative", async () => {
  const { runLab } = await import("../src/index.js");
  const report = await runLab();
  const item = report.cases.find((entry) => entry.id === "flop.yellowpaper-56-57-boundaries");
  assert.equal(item?.status, "PASS");
  assert.equal(item?.normativeStatus, "OPEN_ISSUE");
});
