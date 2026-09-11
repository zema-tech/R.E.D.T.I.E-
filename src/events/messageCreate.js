import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { isAiAvailable } from '../services/ai/groqClient.js';
import { getAiSettings } from '../services/ai/aiConfig.js';
import { scanTicketMessage } from '../services/ai/ticketAi.js';
import { getTicketData } from '../utils/database.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleTicketModeration(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

// Last AI alert per channel — prevents alert spam during incidents.
const ticketAlertCooldown = new Map();
const TICKET_ALERT_COOLDOWN_MS = 60 * 1000;

async function handleTicketModeration(message, client) {
  try {
    // Cheap gates first: no key, no work.
    if (!isAiAvailable() || !message.content?.trim()) {
      return;
    }
    // Skip bot commands (prefix or slash invocations).
    const prefix = (await getGuildConfig(client, message.guild.id))?.prefix || getCommandPrefix();
    if (message.content.startsWith(prefix)) {
      return;
    }

    const settings = await getAiSettings(client, message.guild.id);
    if (!settings.ticketModeration) {
      return;
    }

    const ticketData = await getTicketData(message.guild.id, message.channel.id).catch(() => null);
    if (!ticketData) {
      return; // not a ticket channel
    }

    const scan = await scanTicketMessage(message.content, { sensitivity: settings.sensitivity });
    if (!scan.flagged) {
      return;
    }

    const now = Date.now();
    if (now - (ticketAlertCooldown.get(message.channel.id) || 0) < TICKET_ALERT_COOLDOWN_MS) {
      return;
    }
    ticketAlertCooldown.set(message.channel.id, now);

    logger.info('AI ticket moderation flag', {
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      severity: scan.severity,
      reasons: scan.reasons,
    });

    const reasons = scan.reasons.length ? `\n**Why:** ${scan.reasons.join(', ')}` : '';
    if (scan.severity === 'high' || scan.action === 'alert_staff') {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Staff Attention Needed',
          description: `A message from ${message.author} was flagged by automatic moderation (severity: **${scan.severity}**).${reasons}\nPlease review it.`,
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const warning = await message.channel.send(
      `${message.author}, please keep this ticket respectful and on-topic.${reasons}`,
    ).catch(() => null);
    if (warning) {
      setTimeout(() => warning.delete().catch(() => {}), 30000);
    }
  } catch (error) {
    // Moderation must never break message handling — fail open, log only.
    logger.debug('Ticket moderation scan failed:', error?.message);
  }
};

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}