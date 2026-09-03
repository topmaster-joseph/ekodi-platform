import { sanitizeProjectionText } from './secure-projection.js';

const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const MAX_MESSAGE_CHARS = 4_000;

function text(value, max = MAX_MESSAGE_CHARS) {
  return String(value ?? '').trim().slice(0, max);
}

function extractText(data) {
  const parts = [];
  for (const candidate of Array.isArray(data?.candidates) ? data.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
    }
  }
  return parts.join('\n').trim();
}

export function createGeminiPersonalProvider(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const available = Boolean(apiKey && typeof fetchImpl === 'function');

  return Object.freeze({
    id: 'gemini-personal',
    model,
    available,
    async invoke({ message = '' } = {}) {
      if (!available) throw new Error('GEMINI_PERSONAL_PROVIDER_NOT_CONFIGURED');
      const input = sanitizeProjectionText(text(message), { strict: true, max: MAX_MESSAGE_CHARS });
      if (!input) throw new Error('GEMINI_PERSONAL_EMPTY_INPUT');
      const response = await fetchImpl(`${GEMINI_GENERATE_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: 'You are EKODI User AI, a concise personal assistant. Respect user agency, privacy, tenant boundaries, and never claim external actions without verified results.' }],
          },
          contents: [{ role: 'user', parts: [{ text: input }] }],
          generationConfig: { maxOutputTokens: 800 },
        }),
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
      const output = extractText(data);
      if (!output) throw new Error('GEMINI_EMPTY_RESPONSE');
      return Object.freeze({ text: output, model, responseId: '' });
    },
  });
}

export const GEMINI_PERSONAL_DEFAULTS = Object.freeze({
  model: DEFAULT_GEMINI_MODEL,
  endpoint: GEMINI_GENERATE_URL,
  maxMessageChars: MAX_MESSAGE_CHARS,
});
