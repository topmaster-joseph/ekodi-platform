const PREFIX='/ekodibiz/invest/admin';
const PUBLIC='/ekodibiz/invest';
const CORE='https://invest.ekodi.kr/';
const CONTROL='https://admin.ekodi.kr/?route=finance&source=ekodibiz-invest';
const SECTIONS=Object.freeze({
  overview:['투자사업 관리','프로젝트·IR·투자 연결·프로그램을 한곳에서 운영합니다.'],
  projects:['투자 프로젝트','기업·사업·프로젝트의 준비상태와 검토 흐름을 관리합니다.'],
  ir:['IR · 투자유치','IR 자료·Evidence·커뮤니케이션 준비를 관리합니다.'],
  connect:['투자 연결','투자자·전문기관·파트너 연결 업무의 진행상태를 관리합니다.'],
  programs:['투자 프로그램','지역·산업·임팩트 투자연계 프로그램을 관리합니다.'],
});
function sectionKey(pathname){const clean=String(pathname||'').replace(/\/+$/,'');if(clean===PREFIX)return'overview';if(!clean.startsWith(`${PREFIX}/`))return'';const key=clean.slice(PREFIX.length+1);return Object.hasOwn(SECTIONS,key)?key:''}
export function isEkodiBizInvestAdminPath(pathname){return Boolean(sectionKey(pathname))}
function link(key,label,active){const href=key==='overview'?PREFIX:`${PREFIX}/${key}`;return `<a href="${href}"${active===key?' aria-current="page"':''}>${label}</a>`}
function cards(){return [['projects','프로젝트'],['ir','IR'],['connect','연결'],['programs','프로그램']].map(([k,l])=>`<a class="card" href="${PREFIX}/${k}"><b>${l}</b><span>${SECTIONS[k][1]}</span></a>`).join('')}
export function ekodiBizInvestAdminPage(request){
  const url=new URL(request.url),key=sectionKey(url.pathname);if(!key)return null;const [title,desc]=SECTIONS[key];
  const nav=`<nav>${link('overview','대시보드',key)}${link('projects','프로젝트',key)}${link('ir','IR',key)}${link('connect','연결',key)}${link('programs','프로그램',key)}</nav>`;
  const content=key==='overview'?`<section class="grid">${cards()}</section>`:`<section class="panel"><h2>${title}</h2><p>${desc}</p><p class="muted">공통 분석·실사·Evidence 기능은 EKODI Invest Core를 사용합니다. 사업별 데이터·권한은 EKODIBIZ workspace 경계에서 관리합니다.</p></section>`;
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · EKODIBIZ Invest Admin</title><style>:root{--bg:#f5f7fb;--ink:#172033;--muted:#697386;--line:#e1e6ef;--card:#fff;--accent:#244b37}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 Inter,system-ui,sans-serif}.wrap{max-width:1120px;margin:auto;padding:24px 20px 60px}.top,nav,.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top{justify-content:space-between}.brand{font-weight:850;text-decoration:none;color:inherit}nav a,.button{padding:8px 11px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:inherit;background:#fff}nav a[aria-current=page]{background:var(--ink);color:#fff}.hero{padding:52px 0 24px}.eyebrow{font-size:11px;letter-spacing:.14em;color:var(--accent);font-weight:800}.hero h1{font-size:clamp(32px,5vw,54px);margin:8px 0 12px;letter-spacing:-.045em}.hero p,.muted{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.card,.panel,.boundary{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}.card{display:grid;gap:6px;text-decoration:none;color:inherit}.card span{color:var(--muted)}.boundary{margin-top:18px;border-left:4px solid var(--accent)}.actions{margin-top:18px}.primary{background:var(--accent);border-color:var(--accent);color:#fff}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><main class="wrap" data-ekodi-workspace="ekodibiz" data-ekodi-business-unit="invest" data-ekodi-admin-surface="local"><header class="top"><a class="brand" href="${PUBLIC}">EKODIBIZ INVEST</a>${nav}</header><section class="hero"><div class="eyebrow">WORKSPACE-LOCAL ADMIN</div><h1>${title}</h1><p>${desc}</p><div class="actions"><a class="button primary" href="${CORE}">EKODI Invest Core</a><a class="button" href="${CONTROL}">중앙 Control Tower</a><a class="button" href="${PUBLIC}">사용자 화면</a></div></section>${content}<aside class="boundary"><b>관리 경계</b><p class="muted">이 화면은 EKODIBIZ 투자사업 운영용입니다. 투자금 수취·증권 주문·체결·수탁·수익보장은 실행하지 않습니다. 민감 작업과 실제 데이터 접근은 공통 인증·권한 및 인가된 외부 금융주체 경계를 통과해야 합니다.</p></aside></main></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','x-robots-tag':'noindex, nofollow, noarchive','x-ekodi-route':'public-ekodibiz-invest-admin'}})
}
export const EKODIBIZ_INVEST_ADMIN=Object.freeze({canonicalPath:PREFIX,publicPath:PUBLIC,commonService:CORE,sections:Object.freeze(Object.keys(SECTIONS))});
