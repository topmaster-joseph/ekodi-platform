(() => {
  const params = new URLSearchParams(location.search);
  // AUTH-RETURN-CONTINUITY-001: recover an initiating page when legacy links
  // omit return_to. Explicit destinations always win; never trust foreign referrers.
  if (!params.has('return_to') && !params.has('returnTo') && document.referrer) {
    try {
      const source = new URL(document.referrer);
      const host = source.hostname.toLowerCase();
      const firstParty = host === 'ekodi.kr' || host.endsWith('.ekodi.kr');
      const approvedExternal = ['seonammedi.kr', 'www.seonammedi.kr',
        'xn--3e0b8b58jw4co4mnpll3k.kr', 'www.xn--3e0b8b58jw4co4mnpll3k.kr',
        'cgma.or.kr'].includes(host);
      const authPath = source.pathname === '/auth' || source.pathname.startsWith('/auth/');
      const privateApi = source.pathname === '/api' || source.pathname.startsWith('/api/');
      if (source.protocol === 'https:' && !source.username && !source.password &&
          (firstParty || approvedExternal) && !authPath && !privateApi) {
        const next = new URL(location.href);
        next.searchParams.set('return_to', source.href);
        history.replaceState(history.state, document.title, next.href);
        params.set('return_to', source.href);
      }
    } catch {}
  }
  const interactive = params.get('manage') === '1' || params.get('review') === '1';
  const directAdmin = params.get('site') === 'admin' && params.get('direct') === '1';
  const preopenedAdminBridge = params.get('direct') === '1' && params.get('bridge') === 'preopened';
  document.documentElement.dataset.identityManage = params.get('manage') === '1' ? '1' : '0';
  document.documentElement.dataset.seamlessSso = interactive ? '0' : '1';
  document.documentElement.dataset.adminDirectBridge = directAdmin || preopenedAdminBridge ? '1' : '0';
})();
