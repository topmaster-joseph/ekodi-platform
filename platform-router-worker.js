import sharedSiteWorker from './site-shell-worker.js';
import { injectEkodiShell } from './ekodi-shell-injector.js';

const PLATFORM_HOSTS = Object.freeze({
  'messenger.ekodi.kr': 'messenger',
  'invest.ekodi.kr': 'invest',
});

function resolvedHost(request, env) {
  const url = new URL(request.url);
  if (env?.ENVIRONMENT !== 'staging') return url.hostname.toLowerCase();
  const simulated = String(request.headers.get('x-ekodi-staging-host') || '').trim().toLowerCase();
  return PLATFORM_HOSTS[simulated] ? simulated : url.hostname.toLowerCase();
}

function page(id) {
  const messenger = id === 'messenger';
  const title = messenger ? 'EKODI Messenger' : 'EKODI Investment';
  const eyebrow = messenger ? 'PERSON → SPACE → CONVERSATION → ACTION' : 'DISCOVER → REVIEW → DUE DILIGENCE → CONNECT';
  const headline = messenger ? '대화가 흩어지지 않고,<br><em>실행으로 이어집니다.</em>' : '투자를 서두르기보다,<br><em>먼저 제대로 검토합니다.</em>';
  const lead = messenger
    ? '개인, 교회, 커뮤니티, 사업장과 프로젝트의 대화를 한곳에서 이어갑니다. AI가 먼저 맥락을 정리하고 필요한 경우 사람에게 넘기며, 알림·승인·후속 작업은 원래 EKODI 서비스로 연결합니다.'
    : '사업·기업·프로젝트의 정보를 투자 관점에서 구조화하고 AI 검토 메모, 실사 체크리스트, IR 자료와 리스크 질문을 한 흐름으로 관리합니다.';
  const items = messenger ? [
    ['AI First','질문과 요청을 이해하고 관련 Space와 전문 AI를 찾아 대화를 시작합니다.'],
    ['Workspace Channels','개인·교회·커뮤니티·사업장·프로젝트의 대화를 같은 계정 안에서 분리합니다.'],
    ['Human Handoff','사람의 판단이 필요한 순간에는 대화 맥락을 보존한 채 담당자에게 이어줍니다.'],
    ['Action & Alerts','승인·예약·발행·일정·후속조치를 원래 전문 플랫폼의 실행으로 연결합니다.'],
  ] : [
    ['Opportunity Inbox','기업·사업·프로젝트 후보를 Space별로 모아 검토 상태를 정리합니다.'],
    ['AI Investment Memo','사업모델·시장·팀·재무·경쟁·리스크를 질문 중심의 검토 메모로 구조화합니다.'],
    ['Due Diligence','확인할 자료와 미해결 질문을 체크리스트로 관리해 근거와 추정을 분리합니다.'],
    ['IR & Connection','IR 자료를 다듬고 필요할 때 투자자·전문가·적법한 외부 서비스 연결을 준비합니다.'],
  ];
  const auth = `https://auth.ekodi.kr/?site=${id}&return_to=https%3A%2F%2F${id === 'invest' ? 'invest' : 'messenger'}.ekodi.kr%2F`;
  const notice = messenger
    ? 'Messenger는 전문 플랫폼을 대체하지 않습니다. 대화와 알림을 모으고 실제 업무는 Marketing·Work·Community·Investment 등 원래 시스템으로 넘기는 EKODI의 실시간 소통 계층입니다.'
    : '초기 범위는 투자정보 정리, 연구, 의사결정 지원, IR·실사 지원과 연결입니다. 예치금 수취, 투자금 모집 대행, 증권 주문·체결, 수익 보장 같은 거래 실행 기능은 포함하지 않습니다.';
  const accent = messenger ? '#78d6c6' : '#d5e878';
  const background = messenger ? '#07111f' : '#08140f';
  const panel = messenger ? '#0d1a2c' : '#0e1e17';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="${background}"><title>${title}</title><style>
  :root{color-scheme:dark;--bg:${background};--panel:${panel};--accent:${accent};--text:#f5f7fb;--muted:#a7b5c4;--line:color-mix(in srgb,var(--accent) 22%,#24344b)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 82% 0,color-mix(in srgb,var(--accent) 18%,transparent),transparent 34rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit;text-decoration:none}.wrap{max-width:1120px;margin:auto;padding:28px 22px 72px}.top{display:flex;justify-content:space-between;gap:14px}.brand{font-weight:850;letter-spacing:.08em}.badge{font-size:12px;padding:7px 10px;border:1px solid var(--line);border-radius:999px;color:var(--accent)}.hero{padding:86px 0 50px;max-width:860px}.eyebrow{font-size:12px;letter-spacing:.16em;color:var(--accent);font-weight:800}.hero h1{font-size:clamp(38px,7vw,70px);line-height:1.03;margin:14px 0 22px;letter-spacing:-.04em}.hero h1 em{font-style:normal;color:var(--accent)}.lead{font-size:clamp(17px,2.3vw,21px);line-height:1.7;color:var(--muted);max-width:760px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.button{min-height:48px;padding:0 18px;border-radius:14px;display:inline-flex;align-items:center;font-weight:760}.primary{background:var(--accent);color:#0b1712}.secondary{border:1px solid var(--line)}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.015));border:1px solid var(--line);border-radius:18px;padding:21px;min-height:185px}.card b{display:block;margin-bottom:10px}.card span,.note{color:var(--muted);line-height:1.65;font-size:14px}.notice{margin-top:38px;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:23px}.notice b{display:block;margin-bottom:8px}.footer{margin-top:38px;color:var(--muted);font-size:13px}@media(max-width:780px){.grid{grid-template-columns:1fr 1fr}.hero{padding-top:60px}}@media(max-width:480px){.grid{grid-template-columns:1fr}.wrap{padding-inline:17px}}
  </style></head><body><main class="wrap" data-ekodi-platform="${id}"><header class="top"><a class="brand" href="https://my.ekodi.kr/">EKODI · ${messenger ? 'MESSENGER' : 'INVESTMENT'}</a><span class="badge">BETA · SHARED SPACE</span></header><section class="hero"><div class="eyebrow">${eyebrow}</div><h1>${headline}</h1><p class="lead">${lead}</p><div class="actions"><a class="button primary" href="${auth}">EKODI 로그인으로 시작</a><a class="button secondary" href="https://my.ekodi.kr/">My EKODI</a></div></section><section class="grid">${items.map(([name,copy])=>`<article class="card"><b>${name}</b><span>${copy}</span></article>`).join('')}</section><section class="notice"><b>${messenger ? 'Messenger의 역할' : '운영 원칙'}</b><div class="note">${notice}</div></section><footer class="footer">${title} Beta · EKODI Identity / Space / Role / Shell</footer></main></body></html>`;
}

function platformResponse(id) {
  const response = new Response(page(id), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'x-ekodi-route': `platform-${id}`,
    },
  });
  return injectEkodiShell(response, id);
}

export default {
  async fetch(request, env, ctx) {
    const host = resolvedHost(request, env);
    const id = PLATFORM_HOSTS[host];
    const url = new URL(request.url);
    if (id) {
      if (url.pathname === '/' || url.pathname === '/index.html') return platformResponse(id);
      return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    return sharedSiteWorker.fetch(request, env, ctx);
  },
};
