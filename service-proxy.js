import { injectEkodiShell, shellServiceForHost } from './ekodi-shell-injector.js';

const ORIGINS = Object.freeze({
  'church.ekodi.kr': 'ekodi-church.pages.dev',
  'lab.ekodi.kr': 'ekodilab.pages.dev',
  'mall.ekodi.kr': 'ekodi-mall.pages.dev',
  'mall.biz.ekodi.kr': 'ekodi-mall.pages.dev'
});

const GMAIL = 'https://mail.google.com/';

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

const STAGING_HOSTS = new Set(['biz.ekodi.kr', ...Object.keys(ORIGINS), ...Object.keys(REDIRECTS)]);
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
<meta name="description" content="사업자의 문제를 발견하고 다음 행동과 실제 실행을 연결하는 EKODI BIZ 고객 게이트웨이">
<title>EKODI BIZ · 다음 행동을 실행으로</title>
<style>
:root{font-family:Inter,"Noto Sans KR",system-ui,sans-serif;color:#eaf1fb;background:#07101d}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 0,#17365f 0,transparent 38%),linear-gradient(180deg,#07101d,#0b1220);padding:28px}a{color:inherit;text-decoration:none}.shell{max-width:1120px;margin:auto}.top{display:flex;justify-content:space-between;align-items:center;gap:18px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.05em}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#7ee787;color:#06220d}.root{font-size:13px;color:#b7c6da;padding:9px 13px;border:1px solid #30435f;border-radius:999px}.hero{padding:72px 0 26px}.eyebrow{color:#7ee787;font-weight:800;letter-spacing:.16em;font-size:12px}.hero h1{max-width:960px;font-size:clamp(38px,6.4vw,72px);line-height:1.03;letter-spacing:-.058em;margin:13px 0 20px}.hero p{max-width:780px;color:#afbed2;font-size:17px;line-height:1.75;margin:0}.value-rule{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:20px;color:#d2e4ff;font-size:12px}.value-rule strong{padding:7px 10px;background:#13243c;border-radius:999px;color:#7ee787}.problem-title{margin:26px 0 13px;color:#dce8f7;font-size:14px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{min-height:158px;border:1px solid #253a58;border-radius:18px;background:linear-gradient(180deg,rgba(22,38,61,.9),rgba(11,18,32,.9));padding:19px;display:flex;flex-direction:column;justify-content:space-between;transition:.18s}.card:hover,.card:focus-visible{transform:translateY(-3px);border-color:#7ee787;outline:none}.icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#172b45;color:#8fbaff;font-weight:900}.card strong{display:block;font-size:17px;margin-top:18px}.card small{display:block;color:#96a9c2;line-height:1.55;margin-top:7px}.arrow{align-self:flex-end;color:#7ee787}.primary{border-color:#41695d;background:linear-gradient(180deg,rgba(22,65,55,.82),rgba(11,24,28,.95))}.pilot{margin-top:14px;padding:20px;border:1px solid #2d4767;border-radius:18px;background:#0d1929;display:flex;justify-content:space-between;align-items:center;gap:18px}.pilot strong{display:block;font-size:16px}.pilot span{display:block;color:#95aac4;font-size:12px;line-height:1.55;margin-top:5px}.pilot a{white-space:nowrap;padding:11px 15px;background:#7ee787;color:#06220d;border-radius:10px;font-weight:900;font-size:12px}.backstage{margin-top:26px;padding-top:22px;border-top:1px solid #1c2e46}.backstage-head{display:flex;justify-content:space-between;gap:20px;align-items:end}.backstage h2{font-size:16px;margin:0}.backstage p{color:#8297b1;font-size:11px;margin:5px 0 0}.links{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.links a{border:1px solid #253a58;border-radius:999px;padding:8px 11px;color:#aebed2;font-size:11px}.note{margin-top:22px;padding:17px 19px;border-left:3px solid #7ee787;background:#101d30;border-radius:0 14px 14px 0;color:#abbdd2;font-size:13px;line-height:1.65}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:38px;padding:24px 0;border-top:1px solid #1c2e46;color:#71849f;font-size:12px}@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){body{padding:20px}.hero{padding-top:50px}.grid{grid-template-columns:1fr}.pilot,.backstage-head,.footer{display:block}.pilot a{display:inline-flex;margin-top:14px}.footer span{display:block;margin-top:8px}}
</style>
</head>
<body>
<main class="shell">
<header class="top"><a class="brand" href="https://biz.ekodi.kr"><span class="mark">B</span><span>EKODI BIZ</span></a><a class="root" href="https://ekodi.kr">EKODI ↗</a></header>
<section class="hero">
<div class="eyebrow">BUSINESS NEXT STEP</div>
<h1>사업하면서 지금 가장 해결하고 싶은 것은 무엇인가요?</h1>
<p>서비스 이름을 고르지 않아도 됩니다. 지금 겪는 문제를 선택하면 에코디가 필요한 다음 행동을 찾고, 원하면 실제 실행까지 연결합니다.</p>
<div class="value-rule"><strong>VALUE RULE</strong><span>기본 진단은 가볍게 · 실제 실행과 만들어진 가치에서 수익</span></div>
</section>
<p class="problem-title">지금 가장 필요한 한 가지를 골라주세요.</p>
<section class="grid" aria-label="EKODI BIZ 고객 문제">
<a class="card" href="https://business.ekodi.kr/?problem=sales"><div><span class="icon">↗</span><strong>매출을 늘리고 싶어요</strong><small>매출·재방문·마케팅 신호를 보고 이번 주 1순위를 찾습니다.</small></div><span class="arrow">다음 행동 →</span></a>
<a class="card" href="https://business.ekodi.kr/?problem=repeat"><div><span class="icon">↻</span><strong>단골을 늘리고 싶어요</strong><small>기존 고객이 다시 올 이유와 실행 가능한 재방문 행동을 준비합니다.</small></div><span class="arrow">다음 행동 →</span></a>
<a class="card" href="https://business.ekodi.kr/?problem=marketing"><div><span class="icon">✦</span><strong>홍보를 맡기고 싶어요</strong><small>콘텐츠 아이디어가 아니라 실제 홍보 실행까지 이어지게 합니다.</small></div><span class="arrow">다음 행동 →</span></a>
<a class="card" href="https://business.ekodi.kr/?problem=cost"><div><span class="icon">↓</span><strong>비용을 줄이고 싶어요</strong><small>전기료와 운영비에서 먼저 확인할 절감 신호를 찾습니다.</small></div><span class="arrow">다음 행동 →</span></a>
<a class="card" href="https://business.ekodi.kr/?problem=people"><div><span class="icon">+</span><strong>사람이 필요해요</strong><small>직원·전문가·협력업체가 필요한 상황을 정리하고 연결합니다.</small></div><span class="arrow">다음 행동 →</span></a>
<a class="card primary" href="https://business.ekodi.kr/?problem=unsure"><div><span class="icon">?</span><strong>잘 모르겠어요. 한번 봐주세요</strong><small>전체 상태를 보고 지금 가장 먼저 움직여야 할 한 가지부터 찾습니다.</small></div><span class="arrow">에코디가 보기 →</span></a>
</section>
<section class="pilot" aria-label="자담치킨 1호 실증">
<div><strong>1호 실증 · 자담치킨 목포대점</strong><span>매출·재방문, 홍보, 전기비용 세 영역에서 문제 → 실행 → 결과 → 지불의향을 검증합니다.</span></div>
<a href="https://business.ekodi.kr/jadam?problem=unsure">자담치킨 실행공간</a>
</section>
<section class="backstage" aria-label="전문 서비스">
<div class="backstage-head"><div><h2>전문 서비스는 뒤에서 작동합니다.</h2><p>필요할 때만 연결합니다. 고객이 먼저 기능 목록을 공부할 필요가 없습니다.</p></div></div>
<div class="links"><a href="https://trade.biz.ekodi.kr">Global Trading</a><a href="https://mall.biz.ekodi.kr">EKODI Mall</a><a href="https://pay.biz.ekodi.kr">EKODI Pay</a><a href="https://mail.biz.ekodi.kr">Business Mail</a><a href="https://live.biz.ekodi.kr">Business Live</a></div>
</section>
<div class="note"><strong>공식 운영 주소는 biz.ekodi.kr입니다.</strong> 에코디비즈는 기능을 파는 로비에서, 고객의 문제를 다음 행동과 실제 결과로 연결하는 비즈니스 입구로 전환합니다.</div>
<footer class="footer"><strong>EKODIBIZ · Problem → Next Action → Execution → Result → Value</strong><span>EKODI ecosystem</span></footer>
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
