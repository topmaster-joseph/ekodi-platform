const DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

function outputText(body) {
  if (typeof body?.output_text === 'string') return body.output_text;
  for (const step of body?.steps || []) {
    for (const part of step?.content || []) if (part?.type === 'text' && part?.text) return part.text;
  }
  return '';
}

export function createGeminiWriterProvider({ apiKey, model = 'gemini-3.7-flash', endpoint = DEFAULT_ENDPOINT, fetchImpl = fetch }) {
  const key = String(apiKey || '').trim();
  return {
    id: 'gemini',
    ready() { return Boolean(key); },
    async generate({ prompt, schema }) {
      if (!key) {
        const error = new Error('Gemini writer API key is not configured');
        error.code = 'WRITER_PROVIDER_NOT_CONNECTED';
        throw error;
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'content-type': 'application/json',
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify({
          model,
          input: prompt,
          response_format: { type: 'text', mime_type: 'application/json', schema }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body?.error?.message || `Gemini writer HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const text = outputText(body);
      if (!text) throw new Error('Gemini writer returned no output text');
      return { data: JSON.parse(text), provider: 'gemini', model };
    }
  };
}
