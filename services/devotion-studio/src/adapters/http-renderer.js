export function createHttpRenderer({ endpoint, token = '', fetchImpl = fetch }) {
  const base = String(endpoint || '').replace(/\/$/, '');
  return {
    ready() {
      return Boolean(base);
    },
    async dispatch({ job, snapshot }) {
      if (!base) throw new Error('renderer endpoint is not configured');
      const response = await fetchImpl(`${base}/v1/render`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ job, batch: snapshot })
      });
      if (!response.ok) throw new Error(`renderer dispatch failed: HTTP ${response.status}`);
      return response.json().catch(() => ({}));
    }
  };
}
