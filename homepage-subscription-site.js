// EKODIBIZ 홈페이지 구독으로 자동 개설되는 사이트(https://ekodi.kr/hp-xxxxxxxx) 공개 화면.
// 데이터: public.homepage_site_public(p_slug) — 공개 전(준비 중)에는 이름·연락처를 노출하지 않는다.
// 개인·매장·기관·단체·조직·행사 공용 한 페이지 템플릿 + 검색엔진용 구조화 데이터(JSON-LD).
export const HOMEPAGE_SITE_SLUG = /^hp-[a-z0-9]{8}$/;

export function isHomepageSubscriptionSlug(slug = '') {
  return HOMEPAGE_SITE_SLUG.test(String(slug || '').toLowerCase());
}

const AUDIENCE = Object.freeze({
  personal: { label: '개인', schema: 'Person' },
  business: { label: '매장·기업', schema: 'LocalBusiness' },
  institution: { label: '기관·학교', schema: 'Organization' },
  community: { label: '단체', schema: 'Organization' },
  organization: { label: '조직', schema: 'Organization' },
  event: { label: '행사·프로젝트', schema: 'Event' },
});

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tel = (v) => String(v || '').replace(/[^0-9+]/g, '');
const safeHttps = (v) => { try { const u = new URL(String(v || '')); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

export async function fetchHomepageSite(slug, env, fetchImpl = fetch) {
  if (!isHomepageSubscriptionSlug(slug) || !env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/homepage_site_public`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: String(slug).toLowerCase() }),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && typeof d === 'object' ? d : null;
  } catch { return null; }
}

export function homepageSiteJsonLd(site, url) {
  const a = AUDIENCE[site.audience] || AUDIENCE.business;
  const ld = { '@context': 'https://schema.org', '@type': a.schema, name: site.display_name, url };
  if (site.intro) ld.description = site.intro;
  if (site.phone && a.schema !== 'Event') ld.telephone = site.phone;
  if (site.address) {
    if (a.schema === 'Event') ld.location = { '@type': 'Place', name: site.address, address: site.address };
    else ld.address = site.address;
  }
  if (a.schema === 'LocalBusiness' && site.hours) ld.openingHours = site.hours;
  return JSON.stringify(ld).replace(/</g, '\\u003c');
}

const CSS = `:root{color-scheme:light dark;--bg:#f7f7f3;--card:#fff;--text:#17211c;--muted:#59635d;--line:#dfe4df;--accent:#1f6b4f;--soft:#eef5f0}
@media(prefers-color-scheme:dark){:root{--bg:#101512;--card:#18201b;--text:#edf4ef;--muted:#b0bbb4;--line:#344038;--accent:#8fd2ad;--soft:#202c25}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.7}
main{flex:1;width:100%;max-width:880px;margin:0 auto;padding:28px 16px 48px}
section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:clamp(18px,4vw,34px);margin-bottom:16px}
.kicker{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--accent);font-size:14px;font-weight:800}
h1{margin:.4rem 0;font-size:clamp(1.7rem,6vw,2.4rem);letter-spacing:-.03em}h2{margin:0 0 .6rem;font-size:1.15rem}
p,li,dd{color:var(--muted)}dd a{color:var(--accent)}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0}dt{font-weight:800}dd{margin:0}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.btn{display:inline-flex;align-items:center;min-height:46px;padding:10px 18px;border-radius:999px;border:2px solid var(--accent);color:var(--accent);font-weight:800;text-decoration:none}.btn.primary{background:var(--accent);color:#fff}
@media(prefers-color-scheme:dark){.btn.primary{color:#0d1a14}}
footer{width:min(880px,calc(100% - 32px));margin:0 auto 24px;padding:18px 0;border-top:1px solid var(--line);text-align:center;color:var(--muted);font-size:13px}footer a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}`;

function shell({ title, description, canonical, robots, jsonLd = '', body }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="website">
<style>${CSS}</style>${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}</head><body>${body}
<footer data-site-shell="footer">이 홈페이지는 <a href="https://ekodi.kr/ekodibiz/homepage">에코디비즈 홈페이지 구독</a>으로 운영됩니다.</footer></body></html>`;
}

export function renderHomepageSiteHtml(site, slug) {
  const canonical = `https://ekodi.kr/${String(slug).toLowerCase()}`;
  if (!site) return { status: 404, html: shell({ title: '페이지를 찾을 수 없습니다 · EKODI', description: '요청한 홈페이지가 없습니다.', canonical, robots: 'noindex,nofollow', body: `<main><section><h1>페이지를 찾을 수 없습니다</h1><p>주소를 다시 확인해 주세요.</p></section></main>` }) };
  if (!site.published) return { status: 200, html: shell({ title: '홈페이지 준비 중 · EKODI', description: '홈페이지를 준비하고 있습니다.', canonical, robots: 'noindex,nofollow', body: `<main data-homepage-site="preparing"><section><span class="kicker">준비 중</span><h1>홈페이지를 준비하고 있습니다</h1><p>신청이 접수되어 개설 준비가 진행 중입니다. 공개되면 이 주소에서 바로 볼 수 있습니다.</p></section></main>` }) };
  const a = AUDIENCE[site.audience] || AUDIENCE.business;
  const name = site.display_name || '';
  const phone = String(site.phone || '').trim();
  const address = String(site.address || '').trim();
  const hours = String(site.hours || '').trim();
  const links = (Array.isArray(site.links) ? site.links : []).map((l) => ({ label: String(l?.label || '').slice(0, 40), url: safeHttps(l?.url) })).filter((l) => l.label && l.url).slice(0, 8);
  const map = address ? `https://map.naver.com/p/search/${encodeURIComponent(address)}` : '';
  const info = [phone && `<dt>전화</dt><dd><a href="tel:${esc(tel(phone))}">${esc(phone)}</a></dd>`, address && `<dt>${a.schema === 'Event' ? '장소' : '주소'}</dt><dd>${esc(address)}</dd>`, hours && `<dt>${a.schema === 'Event' ? '일정' : '운영시간'}</dt><dd>${esc(hours)}</dd>`].filter(Boolean).join('');
  const body = `<main data-homepage-site="${esc(slug)}">
<section><span class="kicker">${esc(a.label)}</span><h1>${esc(site.headline || name)}</h1>${site.intro ? `<p>${esc(site.intro)}</p>` : ''}
<div class="actions">${phone ? `<a class="btn primary" href="tel:${esc(tel(phone))}">전화하기</a>` : ''}${map ? `<a class="btn" href="${esc(map)}" target="_blank" rel="noopener noreferrer">지도 보기</a>` : ''}${links.map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</div></section>
${info ? `<section aria-labelledby="info"><h2 id="info">${a.schema === 'Event' ? '행사 안내' : '안내'}</h2><dl>${info}</dl></section>` : ''}
</main>`;
  return { status: 200, html: shell({ title: `${name} · EKODI`, description: site.intro || name, canonical, robots: 'index,follow', jsonLd: homepageSiteJsonLd(site, canonical), body }) };
}

export async function renderHomepageSubscriptionSite(request, env, slug, fetchImpl = fetch) {
  const site = await fetchHomepageSite(slug, env, fetchImpl);
  const { status, html } = renderHomepageSiteHtml(site, slug);
  return new Response(request.method === 'HEAD' ? null : html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': site?.published ? 'public, max-age=120' : 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-ekodi-route': 'space-homepage-subscription',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}
