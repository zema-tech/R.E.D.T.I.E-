// Groq client (OpenAI-compatible API). No extra dependencies.
// Fail-closed: every helper returns { available: false } when GROQ_API_KEY
// is missing so features degrade to "AI disabled" instead of crashing.

import { logger } from '../../utils/logger.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const REQUEST_TIMEOUT_MS = 15000;

export function isAiAvailable() {
  return Boolean(process.env.GROQ_API_KEY);
}

export function getAiModel() {
  return DEFAULT_MODEL;
}

async function groqChat({ messages, temperature = 0.3, maxTokens = 800, jsonMode = false }) {
  if (!isAiAvailable()) {
    return { available: false, error: 'GROQ_API_KEY is not configured.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.warn(`Groq API error ${response.status}: ${detail.slice(0, 200)}`);
      return { available: true, error: `AI service returned HTTP ${response.status}.` };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) {
      return { available: true, error: 'AI service returned an empty response.' };
    }
    return { available: true, content };
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'AI request timed out.' : 'AI service unreachable.';
    logger.warn(`Groq request failed: ${error?.message || error}`);
    return { available: true, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}

// Complete a chat prompt. Returns { available, content?, error? }.
export async function completePrompt({ system, user, temperature, maxTokens }) {
  return groqChat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    maxTokens,
  });
}

// Ask for a strict JSON object. Returns { available, data?, error? }.
export async function completeJson({ system, user, temperature = 0.1, maxTokens = 400 }) {
  const result = await groqChat({
    messages: [
      { role: 'system', content: `${system}\nRespond with a single valid JSON object only.` },
      { role: 'user', content: user },
    ],
    temperature,
    maxTokens,
    jsonMode: true,
  });
  if (!result.content) {
    return result;
  }
  try {
    return { available: true, data: JSON.parse(result.content) };
  } catch {
    logger.warn('Groq returned non-JSON despite json mode.');
    return { available: true, error: 'AI service returned malformed data.' };
  }
}
