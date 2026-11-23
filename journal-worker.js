import { injectEkodiShell } from './ekodi-shell-injector.js';
import { JOURNAL_META, getPublishedPosts, toPublicSummary } from './journal-content.js';
import { bookJournalPosts, mergePosts } from './journal-books.js';
import { issueOf, docNumber, postType } from './journal/issue.js';
import { PLATFORM_ROUTE_REGISTRY } from './platform-route-registry.js';

// JOURNAL-COMMUNITY-LINK-20261109: /journal/community/ 같은 다른 서비스 경로가 저널 안으로 들어오면
// 404 대신 해당 서비스의 정식 주소로 보낸다(휴대폰에서 /journal/community/ 404 발생).
const OTHER_SERVICE_ROOTS = new Set([...PLATFORM_ROUTE_REGISTRY.platformServices, 'my', 'auth'].filter((root) => root !== 'journal'));
export function strayServiceRedirect(url) {
  const first = url.pathname.split('/')[1] || '';
  if (!OTHER_SERVICE_ROOTS.has(first)) return null;
  return Response.redirect(`https://ekodi.kr${url.pathname}${url.search}`, 301);
}

// JOURNAL-BOOKS-001: 기존 글 + 출판된 도서 글(출판 워커 서비스 바인딩).
async function allPosts(env) { return mergePosts(getPublishedPosts(), await bookJournalPosts(env)); }

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://ekodi.kr; connect-src 'self' https://ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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

function rss(posts) {
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

// JOURNAL-MASTHEAD-20261108: JSON Feed 1.1 — 피드 리더·추천 서비스가 바로 읽는 형식.
function jsonFeed(posts) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'EKODI Journal',
    home_page_url: `${JOURNAL_META.canonicalOrigin}/`,
    feed_url: `${JOURNAL_META.canonicalOrigin}/feed.json`,
    description: JOURNAL_META.description,
    language: 'ko-KR',
    items: posts.map((post) => ({
      id: `${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}`,
      url: `${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}`,
      title: post.title,
      summary: post.excerpt,
      content_text: (post.body || []).map((b) => (b.type === 'list' ? (b.items || []).join('\n') : b.text || '')).filter(Boolean).join('\n\n'),
      date_published: new Date(post.publishedAt).toISOString(),
      date_modified: new Date(post.updatedAt || post.publishedAt).toISOString(),
      tags: [post.categoryLabel, postType(post.category), ...(post.values || [])].filter(Boolean),
      authors: [{ name: post.author?.name || 'EKODI Editorial' }],
      _ekodi: { doc: docNumber(post, posts) },
    })),
  };
}

function sitemap(posts) {
  const urls = [
    `<url><loc>${JOURNAL_META.canonicalOrigin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${JOURNAL_META.canonicalOrigin}/submit</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...posts.map((post) =>
      `<url><loc>${JOURNAL_META.canonicalOrigin}/p/${encodeURIComponent(post.slug)}</loc><lastmod>${new Date(post.updatedAt).toISOString()}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    ),
  ];  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
}

// JOURNAL-OVERHAUL-20261108: 글마다 서버에서 제목·설명·OG·구조화 데이터와 본문 요약을 넣어
// 검색엔진·AI 답변엔진이 JavaScript 없이도 글을 읽을 수 있게 한다(SEO·AEO·GEO).
function htmlEscape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function jsonLd(data) { return JSON.stringify(data).replaceAll('<', '\\u003c'); }

export function seoFor(post, posts = []) {
  const origin = JOURNAL_META.canonicalOrigin;
  if (post === 'submit') {
    return { title: '투고 안내 | EKODI Journal', description: '에코디저널 투고 안내 — 원고 분야, 분량과 형식, 진행 순서, 편집 원칙과 원고 접수.', url: `${origin}/submit`, type: 'website',
      ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: '에코디저널 투고 안내', url: `${origin}/submit`, isPartOf: { '@type': 'Periodical', name: 'EKODI Journal', url: `${origin}/` } },
      body: '<h1>에코디저널 투고 안내</h1><p>에세이, 현장 기록, 기술과 AI, 서평 원고를 받습니다. 한글·워드·PDF·텍스트 파일(5MB 이하)을 첨부해 투고하면 편집부가 2주 안에 회신합니다.</p>' };
  }
  if (!post) {
    return {
      title: 'EKODI Journal — 에코디 저널', description: JOURNAL_META.description, url: `${origin}/`, type: 'website',
      ld: { '@context': 'https://schema.org', '@type': 'Blog', name: 'EKODI Journal', alternateName: JOURNAL_META.nameKo, url: `${origin}/`,
        description: JOURNAL_META.description, inLanguage: 'ko-KR',
        blogPost: posts.slice(0, 20).map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: `${origin}/p/${encodeURIComponent(p.slug)}`, datePublished: p.publishedAt })) },
      body: `<h1>EKODI JOURNAL</h1><p>${htmlEscape(JOURNAL_META.description)}</p><ul>${posts.slice(0, 30).map((p) => `<li><a href="/journal/p/${encodeURIComponent(p.slug)}">${htmlEscape(p.title)}</a> — ${htmlEscape(p.excerpt)}</li>`).join('')}</ul>`,
    };
  }
  const url = `${origin}/p/${encodeURIComponent(post.slug)}`;
  const text = (post.body || []).map((b) => (b.type === 'list' ? (b.items || []).join(' · ') : b.text || '')).filter(Boolean);
  const issue = issueOf(post.publishedAt);
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt, url, mainEntityOfPage: url,
    identifier: docNumber(post, posts), genre: postType(post.category),
    isPartOf: { '@type': 'PublicationIssue', issueNumber: String(issue.number), datePublished: `${issue.year}-${String(issue.month).padStart(2, '0')}`,
      isPartOf: { '@type': 'PublicationVolume', volumeNumber: String(issue.volume), isPartOf: { '@type': ['Periodical', 'Blog'], name: 'EKODI Journal', url: `${origin}/` } } },
    datePublished: post.publishedAt, dateModified: post.updatedAt || post.publishedAt, inLanguage: 'ko-KR',
    articleSection: post.categoryLabel, keywords: (post.values || []).join(', '),
    author: { '@type': 'Organization', name: post.author?.name || 'EKODI Editorial' },
    publisher: { '@type': 'Organization', name: 'EKODI', url: 'https://ekodi.kr/' } };
  if (post.coverPhoto?.src) ld.image = `https://ekodi.kr${post.coverPhoto.src}`;
  ld.breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'EKODI', item: 'https://ekodi.kr/' },
    { '@type': 'ListItem', position: 2, name: 'EKODI Journal', item: `${origin}/` },
    { '@type': 'ListItem', position: 3, name: post.title, item: url },
  ] };
  if (post.book?.url) ld.about = { '@type': 'Book', name: post.book.title, url: post.book.url, author: post.book.author || undefined };
  return {
    title: `${post.title} | EKODI Journal`, description: post.excerpt, url, type: 'article', ld,
    body: `<article><p>${htmlEscape(post.categoryLabel)} · ${htmlEscape(String(post.publishedAt).slice(0, 10))}</p><h1>${htmlEscape(post.title)}</h1><p>${htmlEscape(post.excerpt)}</p>${text.slice(0, 40).map((t) => `<p>${htmlEscape(t)}</p>`).join('')}</article>`,
  };
}

export function applySeo(html, seo, { noindex = false } = {}) {
  const head = [
    `<meta property="og:site_name" content="EKODI Journal">`,
    `<meta property="og:type" content="${seo.type}">`,
    `<meta property="og:title" content="${htmlEscape(seo.title)}">`,
    `<meta property="og:description" content="${htmlEscape(seo.description)}">`,
    `<meta property="og:url" content="${htmlEscape(seo.url)}">`,
    `<meta property="og:locale" content="ko_KR">`,
    `<meta name="twitter:card" content="summary">`,
    noindex ? '<meta name="robots" content="noindex">' : '<meta name="robots" content="index,follow,max-snippet:-1">',
    `<script type="application/ld+json">${jsonLd(seo.ld)}</script>`,
  ].join('\n  ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${htmlEscape(seo.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${htmlEscape(seo.description)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${htmlEscape(seo.url)}">\n  ${head}`)
    .replace(/<noscript>[\s\S]*?<\/noscript>/, `<noscript><div class="journal-shell journal-noscript">${seo.body}</div></noscript>`);
}

async function shellHtml(env, request, path) {
  const assetUrl = new URL('/', request.url);
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  let status = response.status;
  let body = await response.text();
  try {
    const posts = await allPosts(env);
    if (path === '/submit') {
      body = applySeo(body, seoFor('submit', posts));
    } else {
      const slugMatch = path.match(/^\/p\/([^/]+)$/);
      const post = slugMatch ? posts.find((p) => p.slug === decodeURIComponent(slugMatch[1])) || null : null;
      if (slugMatch && !post) status = 404;
      body = applySeo(body, seoFor(post, posts), { noindex: status === 404 });
    }
  } catch { /* SEO 보강 실패 시에도 기존 화면은 그대로 제공 */ }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const page = new Response(body, { status, headers });
  return injectEkodiShell(withHeaders(page, status === 404 ? 'no-store' : 'public, max-age=60, stale-while-revalidate=300'), 'journal');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const stray = strayServiceRedirect(url);
    if (stray) return stray;

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
    if (path === '/feed.xml' || path === '/rss.xml') return text(rss(await allPosts(env)), 'application/rss+xml; charset=utf-8');
    if (path === '/feed.json') return text(JSON.stringify(jsonFeed(await allPosts(env))), 'application/feed+json; charset=utf-8');
    if (path === '/sitemap.xml') return text(sitemap(await allPosts(env)), 'application/xml; charset=utf-8');

    if (path === '/api/posts') {
      return json({
        journal: JOURNAL_META,
        posts: (await allPosts(env)).map(toPublicSummary),
      }, 200, PUBLIC_CACHE);
    }

    const apiPost = path.match(/^\/api\/posts\/([^/]+)$/);
    if (apiPost) {
      const slug = decodeURIComponent(apiPost[1]);
      const post = (await allPosts(env)).find(p => p.slug === String(slug || '').trim()) || null;
      return post ? json({ journal: JOURNAL_META, post }, 200, PUBLIC_CACHE) : json({ error: 'not_found' }, 404);
    }

    if (path === '/admin' || path === '/editorial') {
      return Response.redirect('https://ekodi.kr/admin/journal', 307);
    }

    if (path === '/' || path === '/submit' || /^\/p\/[^/]+$/.test(path)) return shellHtml(env, request, path);

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');
    const isCodeAsset = /\.(?:js|css)$/.test(path);
    const cacheControl = isHtml
      ? 'public, max-age=60'
      : isCodeAsset
        ? 'public, max-age=60, must-revalidate'
        : 'public, max-age=86400, immutable';
    return withHeaders(response, cacheControl);
  },
};
