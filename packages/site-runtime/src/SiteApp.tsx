import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import config from 'virtual:ekodi-site-config';

const API = 'https://ekodi-auth-api.topmaster-joseph.workers.dev';

interface CmsPage {
  siteId: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  publishedAt: string;
}

export function SiteApp() {
  const sessionKey = 'ekodiSessionToken';
  const [sessionToken] = useState(() => config.access === 'private' ? sessionStorage.getItem(sessionKey) : null);
  const [authenticated, setAuthenticated] = useState(config.access === 'public');
  const [authenticating, setAuthenticating] = useState(config.access === 'private' && Boolean(sessionToken));
  const [loginError, setLoginError] = useState('');
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [slug, setSlug] = useState(() => window.location.hash.slice(1));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.access !== 'private') return;
    if (!sessionToken) return;
    fetch(`${API}/api/session`, { headers: { authorization: `Bearer ${sessionToken}` } })
      .then(response => {
        if (!response.ok) throw new Error('세션이 만료되었습니다.');
        setAuthenticated(true);
      })
      .catch(() => sessionStorage.removeItem(sessionKey))
      .finally(() => setAuthenticating(false));
  }, [sessionToken]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });
    const data = await response.json() as { token?: string; error?: string };
    if (!response.ok || !data.token) {
      setLoginError(data.error || '로그인 정보를 확인해 주세요.');
      return;
    }
    sessionStorage.setItem(sessionKey, data.token);
    setAuthenticated(true);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/api/content/${encodeURIComponent(config.siteId)}/pages`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { pages?: CmsPage[]; error?: string };
        if (!response.ok) throw new Error(data.error || '콘텐츠를 불러오지 못했습니다.');
        setPages(data.pages || []);
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '콘텐츠를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onHashChange = () => setSlug(window.location.hash.slice(1));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selected = useMemo(() => pages.find(page => page.slug === slug) || pages[0], [pages, slug]);
  useEffect(() => {
    if (selected && selected.slug !== slug) history.replaceState(null, '', `#${selected.slug}`);
  }, [selected, slug]);

  if (config.access === 'private' && !authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-5 text-slate-950 dark:text-slate-950">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl" aria-labelledby="login-title">
          <div className="mb-6 flex items-center gap-3 font-extrabold"><span className="inline-grid size-9 place-items-center rounded-lg bg-lime-300">E</span> EKODI</div>
          <p className="text-xs font-bold tracking-[.16em] text-blue-700">PRIVATE APPLICATION</p>
          <h1 className="mt-2 text-2xl font-bold" id="login-title">{config.siteName} 로그인</h1>
          <p className="mt-2 text-sm text-slate-600">승인된 사용자만 접근할 수 있습니다.</p>
          {authenticating ? <p className="mt-6" aria-live="polite">세션을 확인하는 중입니다.</p> : (
            <form className="mt-6 space-y-4" onSubmit={login}>
              <label className="block text-sm font-semibold">이메일<input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600" name="email" type="email" autoComplete="username" required /></label>
              <label className="block text-sm font-semibold">비밀번호<input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600" name="password" type="password" autoComplete="current-password" minLength={12} required /></label>
              <p className="min-h-5 text-sm text-red-700" role="alert">{loginError}</p>
              <button className="w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" type="submit">로그인</button>
            </form>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--ekodi-color-canvas)] text-[var(--ekodi-color-ink)] dark:bg-slate-950 dark:text-slate-100">
      <a className="sr-only z-50 rounded bg-white p-3 text-blue-800 focus:not-sr-only focus:fixed focus:left-3 focus:top-3" href="#main-content">본문 바로가기</a>
      <header className="border-b border-[var(--ekodi-color-border)] bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-[70px] max-w-6xl items-center gap-6 px-6">
          <a className="rounded font-extrabold no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" href="https://ekodi.kr"><span className="mr-2 inline-grid size-8 place-items-center rounded-lg bg-lime-300 text-slate-950">E</span>EKODI</a>
          <strong className="mr-auto">{config.siteName}</strong>
          <a className="rounded text-sm text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 dark:text-blue-300" href={config.legacyUrl} rel="noopener">기존 콘텐츠 ↗</a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12" id="main-content">
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-blue-700 p-12 text-white shadow-xl">
          <p className="text-xs tracking-[.18em]">EKODI ECOSYSTEM</p>
          <h1 className="my-2 text-4xl font-bold md:text-5xl">{config.siteName}</h1>
          <span className="opacity-70">{config.targetDomain}</span>
        </section>
        <nav className="flex flex-wrap gap-2 py-6" aria-label="사이트 페이지">
          {pages.map(page => <button aria-current={selected?.slug === page.slug ? 'page' : undefined} className={`rounded-full border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${selected?.slug === page.slug ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`} key={page.slug} onClick={() => { window.location.hash = page.slug; setSlug(page.slug); }} type="button">{page.title}</button>)}
        </nav>
        <article className="min-h-72 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-live="polite" aria-busy={loading}>
          {loading && <><h2 className="text-2xl font-bold">콘텐츠를 불러오는 중입니다.</h2><p className="text-slate-500">잠시만 기다려 주세요.</p></>}
          {!loading && error && <><h2 className="text-2xl font-bold">콘텐츠 연결을 확인해 주세요.</h2><p className="text-red-700 dark:text-red-300" role="alert">{error}</p></>}
          {!loading && !error && selected && <><h2 className="text-3xl font-bold">{selected.title}</h2><p className="mt-3 text-lg text-slate-500">{selected.summary}</p><div className="mt-8 whitespace-pre-wrap leading-7">{selected.content}</div></>}
          {!loading && !error && !selected && <><h2 className="text-2xl font-bold">게시 준비 중입니다.</h2><p className="text-slate-500">기존 콘텐츠 링크에서 현재 정보를 확인할 수 있습니다.</p></>}
        </article>
      </main>
      <footer className="px-6 py-8 text-center text-xs text-slate-500">© EKODI · 중앙 CMS에서 관리되는 공식 콘텐츠</footer>
    </div>
  );
}
