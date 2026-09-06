// node --test hooks/useMockActivity.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { activityLabel, nextLevel } from "./useMockActivity.ts";

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
