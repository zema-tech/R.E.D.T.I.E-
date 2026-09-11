// Per-guild AI configuration. Stored on the guild config (passthrough keys)
// with env-var defaults. Fail-closed: AI stays off unless enabled.

import { getGuildConfig, setGuildConfig } from '../config/guildConfig.js';
import { logger } from '../../utils/logger.js';

export const AI_DEFAULTS = {
  // Staff assistant in tickets (/ticket summarize, /ticket suggest).
  ticketAssistant: process.env.AI_TICKET_ASSISTANT !== 'false',
  // Automatic moderation scan of ticket-channel messages.
  ticketModeration: process.env.AI_TICKET_MODERATION !== 'false',
  // low | balanced | strict — shifts flagging sensitivity.
  sensitivity: process.env.AI_SENSITIVITY || 'balanced',
};

export async function getAiSettings(client, guildId) {
  try {
    const config = await getGuildConfig(client, guildId);
    return {
      ticketAssistant: config?.aiTicketAssistant ?? AI_DEFAULTS.ticketAssistant,
      ticketModeration: config?.aiTicketModeration ?? AI_DEFAULTS.ticketModeration,
      sensitivity: config?.aiSensitivity ?? AI_DEFAULTS.sensitivity,
    };
  } catch (error) {
    logger.debug('AI settings fallback to defaults:', error?.message);
    return { ...AI_DEFAULTS };
  }
}

export async function setAiSettings(client, guildId, patch) {
  const current = (await getGuildConfig(client, guildId)) || {};
  const allowed = {};
  if (typeof patch.ticketAssistant === 'boolean') allowed.aiTicketAssistant = patch.ticketAssistant;
  if (typeof patch.ticketModeration === 'boolean') allowed.aiTicketModeration = patch.ticketModeration;
  if (['low', 'balanced', 'strict'].includes(patch.sensitivity)) allowed.aiSensitivity = patch.sensitivity;
  await setGuildConfig(client, guildId, { ...current, ...allowed });
  return getAiSettings(client, guildId);
}
