const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6-terra';
const MAX_MESSAGE_CHARS = 4_000;

function text(value, max = MAX_MESSAGE_CHARS) {
  return String(value ?? '').trim().slice(0, max);
}

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string' && content.text.trim()) parts.push(content.text.trim());
    }
  }
  return parts.join('\n').trim();
}

export function createPersonalOpenAiProvider(options = {}) {
  const apiKey = String(options.apiKey || '').trim();
  const model = String(options.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const available = Boolean(apiKey && typeof fetchImpl === 'function');

  return Object.freeze({
    id:'openai-personal',
    model,
    available,
    async invoke({ message = '' } = {}) {
      if (!available) throw new Error('OPENAI_PERSONAL_PROVIDER_NOT_CONFIGURED');
      const input = text(message);
      if (!input) throw new Error('OPENAI_PERSONAL_EMPTY_INPUT');
      const response = await fetchImpl(OPENAI_RESPONSES_URL, {
        method:'POST',
        headers:{ authorization:`Bearer ${apiKey}`, 'content-type':'application/json' },
        body:JSON.stringify({
          model,
          store:false,
          instructions:'You are EKODI User AI. Be concise, respect user agency, privacy and tenant boundaries, and never claim external execution without verified results.',
          input,
          max_output_tokens:800,
          metadata:{ ekodi_surface:'user', ekodi_funding:'personal' },
        }),
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok) throw new Error(`OPENAI_PERSONAL_HTTP_${response.status}`);
      const output = extractOutputText(data);
      if (!output) throw new Error('OPENAI_PERSONAL_EMPTY_RESPONSE');
      return Object.freeze({ text:output, model:String(data?.model || model), responseId:String(data?.id || '') });
    },
  });
}

export const PERSONAL_OPENAI_DEFAULTS = Object.freeze({ endpoint:OPENAI_RESPONSES_URL, model:DEFAULT_MODEL, maxMessageChars:MAX_MESSAGE_CHARS });
