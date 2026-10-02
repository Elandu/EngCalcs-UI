export type RateLimitDecision =
  | { ok: true; release: () => void }
  | { ok: false; retryAfterMs: number; reason: "rate" | "concurrency" };

/**
 * In-memory sliding-window limiter with a per-key concurrency cap. State lives in one server
 * instance, so it bounds bursts from a client but is not a global quota across instances.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly active = new Map<string, number>();

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxConcurrent: number;
  private readonly maxKeys: number;

  constructor(limit: number, windowMs: number, maxConcurrent: number, maxKeys = 10_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxConcurrent = maxConcurrent;
    this.maxKeys = maxKeys;
  }

  take(key: string, now = Date.now()): RateLimitDecision {
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if ((this.active.get(key) ?? 0) >= this.maxConcurrent) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: 1_000, reason: "concurrency" };
    }
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: Math.max(1, this.windowMs - (now - recent[0])), reason: "rate" };
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    this.evict();
    let released = false;
    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        const count = (this.active.get(key) ?? 1) - 1;
        if (count > 0) this.active.set(key, count);
        else this.active.delete(key);
      },
    };
  }

  private evict() {
    // Maps iterate in insertion order and active keys are re-inserted on use, so the
    // first entries are the least recently used.
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      if (!this.active.has(key)) this.hits.delete(key);
    }
  }
}
