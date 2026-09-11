import { describe, it, expect } from 'vitest';
import { isValidCountingMessage } from '../src/services/countingGameService.js';

const mathCfg = (n) => ({ system: 'math', nextNumber: n });
const decCfg = (n) => ({ system: 'decimal', nextNumber: n });

describe('counting game (math system)', () => {
  it('accepts correct expressions', () => {
    expect(isValidCountingMessage('4*4=16', mathCfg(16))).toBe(true);
    expect(isValidCountingMessage('16', mathCfg(16))).toBe(true);
    expect(isValidCountingMessage('2**3=8', mathCfg(8))).toBe(true);
    expect(isValidCountingMessage('2^3=8', mathCfg(8))).toBe(true);
  });

  it('rejects wrong answers', () => {
    expect(isValidCountingMessage('4*4=15', mathCfg(16))).toBe(false);
    expect(isValidCountingMessage('', mathCfg(1))).toBe(false);
  });

  it('rejects injection and oversized input', () => {
    expect(isValidCountingMessage('1;process.exit()', mathCfg(1))).toBe(false);
    expect(isValidCountingMessage('(1).constructor', mathCfg(1))).toBe(false);
    expect(isValidCountingMessage('9'.repeat(101), mathCfg(1))).toBe(false);
    expect(isValidCountingMessage('1/0', mathCfg(1))).toBe(false);
  });
});

describe('counting game (decimal system)', () => {
  it('matches exact expected value', () => {
    expect(isValidCountingMessage('42', decCfg(42))).toBe(true);
    expect(isValidCountingMessage('43', decCfg(42))).toBe(false);
  });
});
