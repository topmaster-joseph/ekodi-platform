import { sanitizeProjectionText } from './secure-projection.js';

const CLAUDE_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_MESSAGE_CHARS = 4_000;

function text(value, max = MAX_MESSAGE_CHARS) {
  return String(value ?? '').trim().slice(0, max);
}

function extractText(data) {
  return (Array.isArray(data?.content) ? data.content : [])
    .filter(item => item?.type === 'text' && typeof item?.text === 'string')
    .map(item => item.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function createClaudePersonalProvider(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const available = Boolean(apiKey && typeof fetchImpl === 'function');

  return Object.freeze({
    id:'claude-personal',
    model,
    available,
    async invoke({ message = '' } = {}) {
      if (!available) throw new Error('CLAUDE_PERSONAL_PROVIDER_NOT_CONFIGURED');
      const input = sanitizeProjectionText(text(message), { strict: true, max: MAX_MESSAGE_CHARS });
      if (!input) throw new Error('CLAUDE_PERSONAL_EMPTY_INPUT');
      const response = await fetchImpl(CLAUDE_MESSAGES_URL, {
        method:'POST',
        headers:{
          'x-api-key':apiKey,
          'anthropic-version':'2023-06-01',
          'content-type':'application/json',
        },
        body:JSON.stringify({
          model,
          max_tokens:800,
          system:'You are EKODI User AI. Be concise, respect user agency, privacy and tenant boundaries, and never claim external execution without verified results.',
          messages:[{ role:'user', content:input }],
        }),
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(`CLAUDE_PERSONAL_HTTP_${response.status}`);
      const output = extractText(data);
      if (!output) throw new Error('CLAUDE_PERSONAL_EMPTY_RESPONSE');
      return Object.freeze({ text:output, model:String(data?.model || model), responseId:String(data?.id || '') });
    },
  });
}

export const CLAUDE_PERSONAL_DEFAULTS = Object.freeze({ endpoint:CLAUDE_MESSAGES_URL, model:DEFAULT_MODEL, maxMessageChars:MAX_MESSAGE_CHARS });
