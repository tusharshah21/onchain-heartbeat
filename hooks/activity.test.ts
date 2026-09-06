// node --test hooks/activity.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { activityLabel, gasToLevel, nextLevel } from "./activity.ts";

test("nextLevel eases toward the target, never past it", () => {
  assert.equal(nextLevel(0, 100), 45);
  assert.equal(nextLevel(100, 0), 55);
  assert.equal(nextLevel(50, 50), 50);
});

test("nextLevel stays inside 0-100 for any random target", () => {
  for (let i = 0, level = 50; i < 500; i++) {
    level = nextLevel(level);
    assert.ok(level >= 0 && level <= 100, `out of range: ${level}`);
  }
});

test("activityLabel buckets", () => {
  assert.equal(activityLabel(90), "High activity");
  assert.equal(activityLabel(70), "High activity");
  assert.equal(activityLabel(35), "Moderate activity");
  assert.equal(activityLabel(34), "Quiet");
});

test("gasToLevel clamps and spans the observed Base range", () => {
  assert.equal(gasToLevel(0), 0);
  assert.equal(gasToLevel(12_000_000), 0);
  assert.equal(gasToLevel(45_000_000), 100);
  assert.equal(gasToLevel(900_000_000), 100);
  // Observed p10 / p50 / p90 should land in Quiet / Moderate / High.
  assert.equal(activityLabel(gasToLevel(18_900_000)), "Quiet");
  assert.equal(activityLabel(gasToLevel(26_500_000)), "Moderate activity");
  assert.equal(activityLabel(gasToLevel(41_200_000)), "High activity");
});
