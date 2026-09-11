import { describe, it, expect } from 'vitest';
import {
  validateDiscordId,
  validateCustomId,
  validateUrl,
  sanitizeMarkdown,
  sanitizeInput,
} from '../src/utils/validation.js';

describe('validateDiscordId', () => {
  it('accepts 18-20 digit snowflakes', () => {
    expect(validateDiscordId('123456789012345678')).toBe('123456789012345678');
  });

  it('rejects mentions, shorts and non-strings', () => {
    expect(validateDiscordId('<@123456789012345678>')).toBeNull();
    expect(validateDiscordId('123')).toBeNull();
    expect(validateDiscordId(123456789012345678)).toBeNull();
  });
});

describe('validateCustomId', () => {
  it('accepts safe component ids', () => {
    expect(validateCustomId('economy_dashboard_123')).toBe('economy_dashboard_123');
  });

  it('rejects injection and oversize', () => {
    expect(validateCustomId('a:b')).toBeNull();
    expect(validateCustomId('x'.repeat(101))).toBeNull();
  });
});

describe('validateUrl', () => {
  it('accepts http/https', () => {
    expect(validateUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('blocks dangerous schemes', () => {
    expect(validateUrl('javascript:alert(1)')).toBeNull();
    expect(validateUrl('data:text/html,hi')).toBeNull();
    expect(validateUrl('file:///etc/passwd')).toBeNull();
    expect(validateUrl('not a url')).toBeNull();
  });
});

describe('sanitizeMarkdown / sanitizeInput', () => {
  it('escapes markdown control chars', () => {
    expect(sanitizeMarkdown('**hi**')).not.toContain('**');
    expect(sanitizeMarkdown('@everyone')).toBe('@everyone');
  });

  it('truncates and strips control chars', () => {
    expect(sanitizeInput('a'.repeat(3000), 200)).toHaveLength(200);
    expect(sanitizeInput('a\x00b')).toBe('ab');
  });
});
