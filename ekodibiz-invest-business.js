const PREFIX = '/ekodibiz/invest';
const COMMON_INVEST_URL = 'https://invest.ekodi.kr/';

const SECTIONS = Object.freeze({
  overview: {
    title: '투자·IR 사업',
    eyebrow: 'EKODIBIZ · INVESTMENT BUSINESS',
    description: '에코디비즈가 기업·사업·프로젝트의 투자 준비와 연결을 실제 사업으로 수행하는 공간입니다.',
  },
  projects: {
    title: '투자 프로젝트',
    eyebrow: 'PROJECTS',
    description: '에코디비즈가 발굴·검토·지원하는 투자 프로젝트를 사업 단위로 관리합니다.',
  },
  ir: {
    title: 'IR · 투자유치 지원',
    eyebrow: 'IR & FUNDRAISING SUPPORT',
    description: '사업 구조 정리, IR 자료 준비, 근거 점검과 투자자 커뮤니케이션을 지원합니다.',
  },
  connect: {
    title: '투자 연결',
    eyebrow: 'CONNECT',
    description: '기업·프로젝트와 적합한 투자자·전문가·기관을 연결하는 사업 창구입니다.',
  },
  programs: {
    title: '투자 프로그램',
    eyebrow: 'PROGRAMS',
    description: '지역·임팩트·산업별 투자 연계 프로그램과 개별 사업을 운영합니다.',
  },
});
function sectionKey(pathname) {
  const clean = String(pathname || '').replace(/\/+$/, '') || '/';
  if (clean === PREFIX) return 'overview';
  if (!clean.startsWith(`${PREFIX}/`)) return '';
  const suffix = clean.slice(PREFIX.length + 1);
  return Object.hasOwn(SECTIONS, suffix) ? suffix : '';
}

export function isEkodiBizInvestPath(pathname) {
  return Boolean(sectionKey(pathname));
}

function navLink(key, label, active) {
  const href = key === 'overview' ? PREFIX : `${PREFIX}/${key}`;
  return `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
}

function cards() {
  return [
    ['projects', '프로젝트', '투자 검토가 필요한 기업·사업·프로젝트를 실제 사업 파이프라인으로 관리합니다.'],
    ['ir', 'IR 지원', '공식 근거와 사업 맥락을 바탕으로 투자유치 준비와 IR 커뮤니케이션을 돕습니다.'],
    ['connect', '연결', '투자자·전문기관·파트너와의 적합한 연결을 지원하되 거래 실행은 인가 주체에 맡깁니다.'],
    ['programs', '프로그램', '지역·산업·임팩트 등 목적별 투자 연계 사업을 독립 단위로 운영합니다.'],
  ].map(([key, title, body]) => `<a class="card" href="${PREFIX}/${key}"><b>${title}</b><span>${body}</span></a>`).join('');
}
export function ekodiBizInvestBusinessPage(request) {
  const url = new URL(request.url);
  const key = sectionKey(url.pathname);
  if (!key) return null;
  const section = SECTIONS[key];
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${section.title} · EKODIBIZ</title>
<style>:root{color-scheme:light dark;--bg:#f6f5ef;--ink:#152019;--muted:#617068;--line:#d9ddd6;--card:#fff;--accent:#244b37}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 Inter,system-ui,sans-serif}.wrap{max-width:1080px;margin:auto;padding:32px 20px 72px}.top,.actions,.nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top{justify-content:space-between}.brand{font-weight:850;letter-spacing:.05em}.nav a,.button{border:1px solid var(--line);border-radius:999px;padding:8px 12px;text-decoration:none;color:inherit}.nav a[aria-current=page]{background:var(--ink);color:var(--bg)}.hero{padding:72px 0 34px;max-width:780px}.eyebrow{font-size:12px;letter-spacing:.16em;color:var(--accent);font-weight:850}.hero h1{font-size:clamp(38px,7vw,72px);line-height:1.02;margin:12px 0 18px;letter-spacing:-.05em}.hero p{font-size:18px;color:var(--muted);max-width:720px}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card{display:grid;gap:8px;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--card);text-decoration:none;color:inherit}.card span,.note{color:var(--muted)}.boundary{margin-top:24px;padding:18px;border-left:4px solid var(--accent);background:color-mix(in srgb,var(--card) 86%,transparent)}footer{margin-top:42px;color:var(--muted);font-size:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}.hero{padding-top:50px}}</style></head><body>`;
  const nav = `<nav class="nav">${navLink('overview','투자사업',key)}${navLink('projects','프로젝트',key)}${navLink('ir','IR',key)}${navLink('connect','연결',key)}${navLink('programs','프로그램',key)}</nav>`;
  const content = key === 'overview'
    ? `<section class="grid">${cards()}</section>`
    : `<section class="card"><b>${section.title}</b><span>${section.description}</span><p class="note">이 사업의 분석·실사·Evidence 기능은 독립 공통서비스 EKODI Invest를 사용하며, 에코디비즈 사업 데이터와 공통엔진의 핵심 로직은 분리합니다.</p></section>`;
  const html = `${body}<main class="wrap" data-ekodi-workspace="ekodibiz" data-ekodi-business-unit="invest"><header class="top"><a class="brand" href="/ekodibiz">EKODIBIZ</a>${nav}</header><section class="hero"><div class="eyebrow">${section.eyebrow}</div><h1>${section.title}</h1><p>${section.description}</p><div class="actions"><a class="button primary" href="${COMMON_INVEST_URL}">EKODI Invest 공통서비스</a><a class="button" href="/ekodibiz">에코디비즈 홈</a></div></section>${content}<aside class="boundary"><b>사업과 공통서비스의 경계</b><div class="note">이 경로는 에코디비즈의 실제 세부사업입니다. 공통 투자 분석·실사 엔진은 <strong>invest.ekodi.kr</strong>에서 독립적으로 운영되며 다른 Workspace에서도 재사용할 수 있습니다. 투자금 수취·주문·체결·수탁·수익보장은 이 사업 화면에서 수행하지 않습니다.</div></aside><footer>EKODIBIZ · Investment Business · Powered by EKODI Invest Core</footer></main></body></html>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
      'x-content-type-options': 'nosniff',
    },
  });
}

export const EKODIBIZ_INVEST_BUSINESS = Object.freeze({
  canonicalPath: PREFIX,
  workspaceNamespace: 'ekodibiz',
  commonService: COMMON_INVEST_URL,
  businessUnits: Object.freeze(['projects','ir','connect','programs']),
});
