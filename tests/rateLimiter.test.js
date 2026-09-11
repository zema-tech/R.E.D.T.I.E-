import { describe, it, expect } from 'vitest';
import { checkRateLimit, getRateLimitStatus, clearRateLimit } from '../src/utils/rateLimiter.js';

describe('rateLimiter', () => {
  it('allows up to maxAttempts then blocks', async () => {
    const key = `test:${Date.now()}:a`;
    expect(await checkRateLimit(key, 2, 60000)).toBe(true);
    expect(await checkRateLimit(key, 2, 60000)).toBe(true);
    expect(await checkRateLimit(key, 2, 60000)).toBe(false);
    clearRateLimit(key);
  });

  it('status is limited only when budget is exhausted', async () => {
    const key = `test:${Date.now()}:b`;
    expect(getRateLimitStatus(key, 60000, 2).limited).toBe(false);
    await checkRateLimit(key, 2, 60000);
    expect(getRateLimitStatus(key, 60000, 2).limited).toBe(false);
    await checkRateLimit(key, 2, 60000);
    expect(getRateLimitStatus(key, 60000, 2).limited).toBe(true);
    expect(getRateLimitStatus(key, 60000, 2).attempts).toBe(2);
    clearRateLimit(key);
  });

  it('resets after the window expires', async () => {
    const key = `test:${Date.now()}:c`;
    await checkRateLimit(key, 1, 10);
    expect(await checkRateLimit(key, 1, 10)).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(await checkRateLimit(key, 1, 10)).toBe(true);
    clearRateLimit(key);
  });
});
