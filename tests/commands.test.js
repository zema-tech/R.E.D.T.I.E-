import { describe, it, expect } from 'vitest';
import { parsePrefixCommand } from '../src/utils/prefixParser.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../src/config/commands/commandAliases.js';

describe('parsePrefixCommand', () => {
  it('parses command and args', () => {
    expect(parsePrefixCommand('!ban @user spam', '!')).toEqual({
      commandName: 'ban',
      args: ['@user', 'spam'],
    });
  });

  it('handles quoted arguments', () => {
    expect(parsePrefixCommand('!warn @user "bad behavior"', '!')).toEqual({
      commandName: 'warn',
      args: ['@user', 'bad behavior'],
    });
  });

  it('returns null for non-commands', () => {
    expect(parsePrefixCommand('hello world', '!')).toBeNull();
    expect(parsePrefixCommand('!', '!')).toBeNull();
    expect(parsePrefixCommand('', '!')).toBeNull();
  });

  it('lowercases the command name', () => {
    expect(parsePrefixCommand('!BAN @user', '!').commandName).toBe('ban');
  });
});

describe('command aliases (v3 mapping)', () => {
  it('maps removed names to merged commands', () => {
    expect(resolveCommandAlias('unmute')).toBe('timeout');
    expect(resolveCommandAlias('unlock')).toBe('lock');
    expect(resolveCommandAlias('vadmin')).toBe('verification-setup');
  });

  it('passes through real command names', () => {
    expect(resolveCommandAlias('ban')).toBe('ban');
    expect(resolveCommandAlias('ticket')).toBe('ticket');
  });

  it('resolves subcommand shorthands', () => {
    expect(resolveSubcommandAlias('rm')).toBe('remove');
    expect(resolveSubcommandAlias('ls')).toBe('list');
  });
});
