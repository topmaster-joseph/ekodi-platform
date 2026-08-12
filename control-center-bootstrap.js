(() => {
  const nativeFetch = window.fetch.bind(window);
  const legacyApiOrigin = 'https://ekodi-auth-api.topmaster-joseph.workers.dev';
  const canonicalApiOrigin = 'https://api.ekodi.kr';
  const legacyMonitorPrefix = 'https://raw.githubusercontent.com/topmaster-joseph/ekodi-platform/main/monitor-status.json';

  function inputUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return String(input);
  }

  function rewriteInput(input, url) {
    return input instanceof Request ? new Request(url, input) : url;
  }

  function withBearer(init = {}) {
    const headers = new Headers(init.headers || {});
    const token = sessionStorage.getItem('ekodi-auth-token');
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
    return { ...init, headers, cache: 'no-store' };
  }

  function fallbackApiUrl(url) {
    if (!url.startsWith(canonicalApiOrigin)) return null;
    return legacyApiOrigin + url.slice(canonicalApiOrigin.length);
  }

  async function fetchWithApiFallback(input, init, canonicalUrl) {
    const canonicalInput = rewriteInput(input, canonicalUrl);
    try {
      const response = await nativeFetch(canonicalInput, init);
      if (![404, 502, 522, 523, 525, 530].includes(response.status)) return response;
      const fallback = fallbackApiUrl(canonicalUrl);
      return fallback ? nativeFetch(rewriteInput(input, fallback), init) : response;
    } catch (error) {
      const fallback = fallbackApiUrl(canonicalUrl);
      if (!fallback) throw error;
      return nativeFetch(rewriteInput(input, fallback), init);
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = inputUrl(input);

    if (url.startsWith(legacyMonitorPrefix)) {
      const options = withBearer(init);
      return fetchWithApiFallback(input, options, `${canonicalApiOrigin}/api/control/overview`);
    }

    if (url.startsWith(legacyApiOrigin)) {
      const canonicalUrl = canonicalApiOrigin + url.slice(legacyApiOrigin.length);
      const response = await fetchWithApiFallback(input, init, canonicalUrl);
      if (response.ok && /\/api\/(login|setup)(?:$|\?)/.test(canonicalUrl)) {
        setTimeout(() => {
          if (typeof window.loadMonitorStatus === 'function') window.loadMonitorStatus();
        }, 500);
      }
      return response;
    }

    return nativeFetch(input, init);
  };
})();
