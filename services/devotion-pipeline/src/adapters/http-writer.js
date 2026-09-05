export function createHttpWriter({ endpoint, token = '', fetchImpl = fetch }) {
  const base = String(endpoint || '').replace(/\/$/, '');
  return {
    ready() { return Boolean(base); },
    async write(input) {
      if (!base) {
        const error = new Error('writer endpoint is not configured');
        error.code = 'PIPELINE_WRITER_DISCONNECTED';
        throw error;
      }
      const response = await fetchImpl(`${base}/v1/write`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(input)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || `writer request failed: HTTP ${response.status}`);
        error.code = body.code || 'WRITER_REQUEST_FAILED';
        throw error;
      }
      return body;
    }
  };
}
