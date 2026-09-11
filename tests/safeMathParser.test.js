import { describe, it, expect } from 'vitest';
import { evaluateMathExpression } from '../src/utils/safeMathParser.js';

describe('evaluateMathExpression', () => {
  it('evaluates basic arithmetic with precedence', () => {
    expect(evaluateMathExpression('2+3*4')).toBe(14);
    expect(evaluateMathExpression('(2+3)*4')).toBe(20);
    expect(evaluateMathExpression('10/4')).toBeCloseTo(2.5);
  });

  it('supports power, modulo and unary minus', () => {
    expect(evaluateMathExpression('2^3')).toBe(8);
    expect(evaluateMathExpression('10%3')).toBe(1);
    expect(evaluateMathExpression('-5+2')).toBe(-3);
  });

  it('supports functions and constants', () => {
    expect(evaluateMathExpression('sqrt(16)')).toBe(4);
    expect(evaluateMathExpression('abs(0-7)')).toBe(7);
    expect(evaluateMathExpression('pi')).toBeCloseTo(Math.PI);
  });

  it('rejects code injection and unknown tokens', () => {
    expect(() => evaluateMathExpression('process.exit()')).toThrow();
    expect(() => evaluateMathExpression('1;2')).toThrow();
    expect(() => evaluateMathExpression('constructor')).toThrow();
    expect(() => evaluateMathExpression('__proto__')).toThrow();
  });

  it('rejects non-finite results and malformed input', () => {
    expect(() => evaluateMathExpression('1/0')).toThrow();
    expect(() => evaluateMathExpression('(2+3')).toThrow();
    expect(() => evaluateMathExpression('')).toThrow();
    expect(() => evaluateMathExpression('2..3')).toThrow();
  });
});
