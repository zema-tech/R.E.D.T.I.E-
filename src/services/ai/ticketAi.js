// AI features for tickets (Groq): moderation scan, summaries, reply drafts.
// Privacy: only ticket-channel content is ever sent, truncated (data
// minimization), and only when the guild has the module enabled.

import { completeJson, completePrompt, isAiAvailable } from './groqClient.js';
import { logger } from '../../utils/logger.js';

const MAX_SCAN_CHARS = 1000;
const MAX_HISTORY_MESSAGES = 20;

const SENSITIVITY_HINTS = {
  low: 'Flag only blatant abuse, explicit spam, or clearly exposed personal data. When in doubt, do not flag.',
  balanced: 'Flag probable spam, harassment, hate, sexual content involving minors, or exposed personal data.',
  strict: 'Flag even mild rudeness, off-topic spam, ALL-CAPS flooding, or any personal data (phone, email, address).',
};

function truncate(text, max) {
  const clean = String(text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// Scan one user message. Returns { flagged, severity, reasons[], action }.
// Never throws — fail-open (unflagged) on any AI error.
export async function scanTicketMessage(text, { sensitivity = 'balanced' } = {}) {
  const clean = truncate(text, MAX_SCAN_CHARS);
  if (!clean || !isAiAvailable()) {
    return { flagged: false, severity: 'none', reasons: [], action: 'none' };
  }

  const result = await completeJson({
    system: `You moderate Discord support-ticket messages. ${SENSITIVITY_HINTS[sensitivity] || SENSITIVITY_HINTS.balanced}
Respond with JSON: { "flagged": boolean, "severity": "low"|"medium"|"high", "reasons": [short strings], "action": "none"|"warn"|"alert_staff" }.
"high" is reserved for hate, threats, sexual content involving minors, or doxxing.`,
    user: `Message to moderate:\n"""${clean}"""`,
  });

  if (!result.data || typeof result.data.flagged !== 'boolean') {
    return { flagged: false, severity: 'none', reasons: [], action: 'none' };
  }

  const severity = ['low', 'medium', 'high'].includes(result.data.severity)
    ? result.data.severity
    : 'low';
  return {
    flagged: result.data.flagged,
    severity,
    reasons: Array.isArray(result.data.reasons) ? result.data.reasons.slice(0, 4).map(String) : [],
    action: result.data.action === 'alert_staff' ? 'alert_staff' : result.data.action === 'warn' ? 'warn' : 'none',
  };
}

async function fetchTicketHistory(channel, limit = MAX_HISTORY_MESSAGES) {
  try {
    const messages = await channel.messages.fetch({ limit });
    return [...messages.values()]
      .filter((m) => !m.author.bot && m.content?.trim())
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map((m) => `${m.author.tag}: ${truncate(m.content, 300)}`)
      .join('\n');
  } catch (error) {
    logger.warn('AI ticket history fetch failed:', error?.message);
    return '';
  }
}

// Summarize the ticket conversation for staff handoff / transcripts.
export async function summarizeTicket(channel) {
  const history = await fetchTicketHistory(channel);
  if (!history) {
    return { available: true, error: 'Not enough conversation to summarize yet.' };
  }
  return completePrompt({
    system: 'You summarize Discord support tickets for staff. Output: 1) one-line issue, 2) key facts (bullets, max 5), 3) suggested next step. Keep under 900 characters, plain Discord markdown, no greeting.',
    user: `Ticket conversation:\n${history}`,
    temperature: 0.2,
    maxTokens: 500,
  });
}

// Draft a staff reply in the ticket's context.
export async function suggestTicketReply(channel, staffHint = '') {
  const history = await fetchTicketHistory(channel);
  if (!history) {
    return { available: true, error: 'Not enough conversation to draft a reply yet.' };
  }
  const hint = truncate(staffHint, 300);
  return completePrompt({
    system: 'You draft professional Discord support replies: polite, concise, actionable, no promises you cannot keep, no invented policies. Plain Discord markdown, under 900 characters. The staffer will review before sending.',
    user: `Ticket conversation:\n${history}${hint ? `\nStaff direction: ${hint}` : ''}\n\nDraft the next staff reply:`,
    temperature: 0.4,
    maxTokens: 500,
  });
}

// --- Self-improvement feedback loop -------------------------------------
// Staff 👍/👎 on AI outputs, stored per guild (capped). Surfaced via
// /ticket ai-stats so staff can see accuracy drift over time.

const FEEDBACK_KEY_PREFIX = 'ai:feedback:';
const MAX_FEEDBACK_ENTRIES = 200;

export async function recordAiFeedback(client, guildId, { kind, rating, excerpt }) {
  try {
    const key = `${FEEDBACK_KEY_PREFIX}${guildId}`;
    const existing = (await client.db.get(key, [])) || [];
    const list = Array.isArray(existing) ? existing : [];
    list.push({ kind, rating, excerpt: truncate(excerpt, 160), at: Date.now() });
    await client.db.set(key, list.slice(-MAX_FEEDBACK_ENTRIES));
    return true;
  } catch (error) {
    logger.warn('AI feedback store failed:', error?.message);
    return false;
  }
}

export async function getAiStats(client, guildId) {
  try {
    const list = (await client.db.get(`${FEEDBACK_KEY_PREFIX}${guildId}`, [])) || [];
    const entries = Array.isArray(list) ? list : [];
    const up = entries.filter((e) => e.rating === 'up').length;
    const down = entries.filter((e) => e.rating === 'down').length;
    return { total: entries.length, up, down, accuracy: up + down ? Math.round((up / (up + down)) * 100) : null };
  } catch {
    return { total: 0, up: 0, down: 0, accuracy: null };
  }
}
