import { injectEkodiShell } from './ekodi-shell-injector.js';
import { JOURNAL_META, getPost, getPublishedPosts, toPublicSummary } from './journal-content.js';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://shell.ekodi.kr; connect-src 'self' https://shell.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const PUBLIC_CACHE = 'public, max-age=120, stale-while-revalidate=600';

function json(data, status = 200, cache = 'no-store') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
      ...SECURITY_HEADERS,
    },
  });
}

function text(body, contentType = 'text/plain; charset=utf-8', cache = PUBLIC_CACHE) {
  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': cache,
      ...SECURITY_HEADERS,
    },
  });
}

function withHeaders(response, cache = null) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  if (cache) headers.set('cache-control', cache);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function rss() {
  const posts = getPublishedPosts();
  const items = posts.map((post) => `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}</link>
      <guid isPermaLink="true">${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(post.excerpt)}</description>
      <category>${xmlEscape(post.categoryLabel)}</category>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>EKODI Journal</title>
  <link>${JOURNAL_META.canonicalOrigin}</link>
  <description>${xmlEscape(JOURNAL_META.description)}</description>
  <language>ko-KR</language>
  <lastBuildDate>${new Date(posts[0]?.updatedAt || Date.now()).toUTCString()}</lastBuildDate>
  ${items}
</channel></rss>`;
}

function sitemap() {
  const urls = [
    `<url><loc>${JOURNAL_META.canonicalOrigin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...getPublishedPosts().map((post) =>
      `<url><loc>${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}</loc><lastmod>${new Date(post.updatedAt).toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    ),
  ];  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

async function shellHtml(env, request) {
  const assetUrl = new URL('/', request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  return injectEkodiShell(withHeaders(response, 'public, max-age=60, stale-while-revalidate=300'), 'journal');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health') {
      return json({
        ok: true,
        service: 'ekodi-journal',
        publicName: 'EKODI Journal',
        boundary: 'registered-common-service',
        canonical: JOURNAL_META.canonicalOrigin,
        contentModel: 'git-versioned-editorial',
        publicCache: true,
        aiDependency: 'none-for-reading',
        publishingMode: 'reviewed-release',
        workspaceIdentity: 'not-derived-from-hostname',
        shell: 'v2',
        feed: '/feed.xml',
        api: '/api/posts',
      });    }

    if (path === '/robots.txt') {
      return text(`User-agent: *\nAllow: /\nSitemap: ${JOURNAL_META.canonicalOrigin}/sitemap.xml\n`);
    }
    if (path === '/feed.xml' || path === '/rss.xml') return text(rss(), 'application/rss+xml; charset=utf-8');
    if (path === '/sitemap.xml') return text(sitemap(), 'application/xml; charset=utf-8');

    if (path === '/api/posts') {
      return json({
        journal: JOURNAL_META,
        posts: getPublishedPosts().map(toPublicSummary),
      }, 200, PUBLIC_CACHE);
    }

    const apiPost = path.match(/^\/api\/posts\/([^/]+)$/);
    if (apiPost) {
      const post = getPost(decodeURIComponent(apiPost[1]));
      return post ? json({ journal: JOURNAL_META, post }, 200, PUBLIC_CACHE) : json({ error: 'not_found' }, 404);
    }

    if (path === '/admin' || path === '/editorial') {
      return Response.redirect('https://admin.ekodi.kr/journal', 307);
    }

    if (path === '/' || /^\/p\/[^/]+$/.test(path)) return shellHtml(env, request);

    const response = await env.ASSETS.fetch(request);    return withHeaders(response, response.headers.get('content-type')?.includes('text/html') ? 'public, max-age=60' : 'public, max-age=86400, immutable');
  },
};
