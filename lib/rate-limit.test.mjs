import assert from "node:assert/strict";
import test from "node:test";

import { SlidingWindowLimiter } from "./rate-limit.ts";

test("limits requests per key within a sliding window", () => {
  const limiter = new SlidingWindowLimiter(3, 60_000, 10);
  for (let index = 0; index < 3; index += 1) {
    const decision = limiter.take("user-a", 1_000 + index);
    assert.equal(decision.ok, true);
    decision.release();
  }
  const blocked = limiter.take("user-a", 2_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "rate");
  assert.equal(blocked.retryAfterMs, 59_000);
  assert.equal(limiter.take("user-b", 2_000).ok, true);
  assert.equal(limiter.take("user-a", 61_001).ok, true);
});

test("caps concurrent requests until they are released", () => {
  const limiter = new SlidingWindowLimiter(100, 60_000, 2);
  const first = limiter.take("user", 0);
  const second = limiter.take("user", 1);
  const third = limiter.take("user", 2);
  assert.equal(third.ok, false);
  assert.equal(third.reason, "concurrency");
  first.release();
  first.release();
  assert.equal(limiter.take("user", 3).ok, true);
  assert.equal(limiter.take("user", 4).ok, false);
  second.release();
});

test("evicts idle keys beyond the memory bound", () => {
  const limiter = new SlidingWindowLimiter(5, 60_000, 1, 2);
  for (const key of ["a", "b", "c"]) limiter.take(key, 0).release();
  const held = limiter.take("d", 0);
  assert.equal(held.ok, true);
  assert.ok(limiter.hits.size <= 2);
  held.release();
});
