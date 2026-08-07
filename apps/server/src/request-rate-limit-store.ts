import type {
  RequestRateLimitConsumeInput,
  RequestRateLimitConsumeResult,
  RequestRateLimitStore,
} from "./types.js";

export function createInMemoryRequestRateLimitStore(): RequestRateLimitStore {
  const buckets = new Map<string, { resetAt: number; count: number }>();
  let lastSweepAt = 0;

  return {
    consume(input: RequestRateLimitConsumeInput): RequestRateLimitConsumeResult {
      if (input.now - lastSweepAt >= input.windowMs) {
        for (const [key, bucket] of buckets.entries()) {
          if (input.now >= bucket.resetAt) buckets.delete(key);
        }
        lastSweepAt = input.now;
      }

      let bucket = buckets.get(input.key);
      if (!bucket || input.now >= bucket.resetAt) {
        bucket = { resetAt: input.now + input.windowMs, count: 0 };
        buckets.set(input.key, bucket);
      }
      bucket.count += 1;
      return { allowed: bucket.count <= input.maxRequests, resetAt: bucket.resetAt };
    },
    reset(key: string) {
      buckets.delete(key);
    },
    close() {
      buckets.clear();
    },
  };
}
