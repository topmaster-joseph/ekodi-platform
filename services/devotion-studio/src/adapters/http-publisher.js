export function createHttpPublisher({ endpoint, token = '', fetchImpl = fetch }) {
  const base = String(endpoint || '').replace(/\/$/, '');
  return {
    ready(target) {
      return Boolean(base && target?.config_ref);
    },
    async schedule({ publication, target, snapshot }) {
      if (!base) throw new Error('publisher endpoint is not configured');
      const response = await fetchImpl(`${base}/v1/schedule`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ publication, target, batch: snapshot })
      });
      if (!response.ok) throw new Error(`publication schedule failed: HTTP ${response.status}`);
      return response.json().catch(() => ({}));
    }
  };
}
