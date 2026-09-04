import { injectEkodiShell, shellServiceForHost } from './ekodi-shell-injector.js';

const ORIGINS = Object.freeze({
  'church.ekodi.kr': 'ekodi-church.pages.dev',
  'lab.ekodi.kr': 'ekodilab.pages.dev'
});

const GMAIL = 'https://mail.google.com/';
const MALL_CANONICAL = 'https://ekodi.kr/ekodibiz/mall';
const CANONICAL_REDIRECTS = Object.freeze({
  'mall.ekodi.kr': MALL_CANONICAL,
  'mall.biz.ekodi.kr': MALL_CANONICAL
});

const REDIRECTS = Object.freeze({
  'live.church.ekodi.kr': 'https://www.youtube.com/@ekodichurch/live',
  'mail.ekodi.kr': GMAIL,
  'mail.biz.ekodi.kr': GMAIL,
  'mail.church.ekodi.kr': GMAIL,
  'mail.lab.ekodi.kr': GMAIL,
  'mail.books.ekodi.kr': GMAIL,
  'mail.trade.ekodi.kr': GMAIL
});

const BIZ_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ');

const STAGING_HOSTS = new Set(['biz.ekodi.kr', ...Object.keys(ORIGINS), ...Object.keys(REDIRECTS), ...Object.keys(CANONICAL_REDIRECTS)]);
function requestHost(request, env, incoming) {
  if (env?.ENVIRONMENT !== 'staging') return incoming.hostname;
  const requested = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  return STAGING_HOSTS.has(requested) ? requested : incoming.hostname;
}

function businessHub() {
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#07101d">
<title>EKODI BIZ · Business Hub</title>
<style>
:root{font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#eaf1fb;background:#07101d}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 0,#17365f 0,transparent 38%),linear-gradient(180deg,#07101d,#0b1220);padding:28px}a{color:inherit;text-decoration:none}.shell{max-width:1120px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:18px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.05em}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#7ee787;color:#06220d}.root{font-size:13px;color:#b7c6da;padding:9px 13px;border:1px solid #30435f;border-radius:999px}.hero{padding:76px 0 34px}.eyebrow{color:#7ee787;font-weight:800;letter-spacing:.16em;font-size:12px}.hero h1{font-size:clamp(42px,7vw,76px);line-height:.98;letter-spacing:-.055em;margin:13px 0 20px}.hero p{max-width:760px;color:#afbed2;font-size:17px;line-height:1.75;margin:0}.context{display:inline-block;margin-top:18px;padding:7px 10px;background:#13243c;border-radius:999px;color:#d2e4ff;font-size:12px}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px;margin-top:30px}.card{min-height:190px;border:1px solid #253a58;border-radius:20px;background:linear-gradient(180deg,rgba(22,38,61,.9),rgba(11,18,32,.9));padding:20px;display:flex;flex-direction:column;justify-content:space-between;transition:.18s}.card:hover{transform:translateY(-3px);border-color:#6d9bdd}.icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#172b45;color:#8fbaff;font-weight:800}.card strong{display:block;font-size:17px;margin-top:22px}.card small{display:block;color:#96a9c2;line-height:1.55;margin-top:7px}.arrow{align-self:flex-end;color:#8fbaff}.note{margin-top:22px;padding:17px 19px;border-left:3px solid #7ee787;background:#101d30;border-radius:0 14px 14px 0;color:#abbdd2;font-size:13px;line-height:1.65}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:42px;padding:24px 0;border-top:1px solid #1c2e46;color:#71849f;font-size:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){body{padding:20px}.hero{padding-top:52px}.grid{grid-template-columns:1fr}.footer{display:block}.footer span{display:block;margin-top:8px}}
</style>
</head>
<body>
<main class="shell">
<header class="top"><a class="brand" href="https://ekodi.kr/ekodibiz"><span class="mark">B</span><span>EKODI BIZ</span></a><a class="root" href="https://ekodi.kr">EKODI ↗</a></header>
<section class="hero"><div class="eyebrow">BUSINESS LOBBY</div><h1>EKODI BIZ</h1><p>에코디비즈의 사업 서비스를 한곳에서 연결하는 독립 비즈니스 로비입니다. 무역, 쇼핑, 결제, 메일, 라이브를 하나의 계층형 도메인 체계로 운영합니다.</p><span class="context">biz.ekodi.kr · EKODI → BIZ → SERVICE</span></section>
<section class="grid" aria-label="EKODI BIZ 서비스">
<a class="card" href="https://trade.biz.ekodi.kr"><div><span class="icon">T</span><strong>Global Trading</strong><small>글로벌 B2B 무역 · GPU · AI Server · Components</small></div><span class="arrow">↗</span></a>
<a class="card" href="https://ekodi.kr/ekodibiz/mall"><div><span class="icon">M</span><strong>EKODI Mall</strong><small>상품과 서비스의 비즈니스 커머스 허브</small></div><span class="arrow">↗</span></a>
<a class="card" href="https://pay.biz.ekodi.kr"><div><span class="icon">P</span><strong>EKODI Pay</strong><small>결제와 사업부별 회계 관제 진입점</small></div><span class="arrow">↗</span></a>
<a class="card" href="https://mail.biz.ekodi.kr"><div><span class="icon">@</span><strong>Business Mail</strong><small>Google Workspace 기반 비즈니스 메일 로비</small></div><span class="arrow">↗</span></a>
<a class="card" href="https://live.biz.ekodi.kr"><div><span class="icon">▶</span><strong>Business Live</strong><small>비즈니스 방송과 라이브 콘텐츠 로비</small></div><span class="arrow">↗</span></a>
</section>
<div class="note">공식 운영 주소는 <strong>biz.ekodi.kr</strong>입니다. 기존 <strong>ekodibiz.kr</strong>은 브랜드 보호·전환 주소로 유지하고 이 로비로 영구 연결합니다.</div>
<footer class="footer"><strong>EKODIBIZ · One business hub, many doors.</strong><span>Managed in the EKODI ecosystem</span></footer>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'content-security-policy': BIZ_CSP,
      'x-ekodi-edge': 'business-hub'
    }
  });
}

export default {
  async fetch(request, env = {}) {
    const incoming = new URL(request.url);
    const host = requestHost(request, env, incoming);

    const canonicalBase = CANONICAL_REDIRECTS[host];
    if (canonicalBase) {
      const target = new URL(canonicalBase);
      const suffix = incoming.pathname === '/' ? '' : incoming.pathname;
      target.pathname = `${target.pathname.replace(/\/$/, '')}${suffix}`;
      target.search = incoming.search;
      return Response.redirect(target.toString(), 308);
    }

    if (incoming.pathname === '/admin' || incoming.pathname === '/admin/') {
      const target = new URL('https://admin.ekodi.kr/');
      target.searchParams.set('source', host);
      return Response.redirect(target.toString(), 307);
    }

    if (host === 'biz.ekodi.kr' && (incoming.pathname === '/' || incoming.pathname === '/index.html')) {
      return injectEkodiShell(businessHub(), 'biz');
    }

    const redirectTarget = REDIRECTS[host];
    if (redirectTarget) return Response.redirect(redirectTarget, 302);

    const originHost = ORIGINS[host];
    if (!originHost) return new Response('Not found', { status: 404 });

    const upstreamUrl = new URL(incoming);
    upstreamUrl.protocol = 'https:';
    upstreamUrl.hostname = originHost;
    upstreamUrl.port = '';

    const upstreamRequest = new Request(upstreamUrl, request);
    upstreamRequest.headers.delete('x-ekodi-staging-host');
    const upstreamResponse = await fetch(upstreamRequest);
    const headers = new Headers(upstreamResponse.headers);

    const location = headers.get('location');
    if (location) {
      try {
        const redirect = new URL(location, upstreamUrl);
        if (redirect.hostname === originHost) {
          redirect.hostname = host;
          redirect.protocol = 'https:';
          headers.set('location', redirect.toString());
        }
      } catch {
        // Preserve non-URL Location headers unchanged.
      }
    }

    headers.set('x-ekodi-edge', 'service-proxy');
    const response=new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers
    });
    return injectEkodiShell(response,shellServiceForHost(host));
  }
};