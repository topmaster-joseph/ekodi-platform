const PLATFORM_PATH = /^\/(?:preview|ekodibiz\/preview)\/platform\/?$/i;
const DEV_PATH = /^\/(?:preview|ekodibiz\/preview)\/dev\/?$/i;
const HUB_PATH = /^\/(?:preview|ekodibiz\/preview)\/?$/i;
const ASSET_PREFIX = '/preview/assets/';

function routeInfo(pathname) {
  const scope = pathname.toLowerCase().startsWith('/ekodibiz/') ? 'ekodibiz' : 'ekodi';
  if (PLATFORM_PATH.test(pathname)) return { scope, mode:'platform' };
  if (DEV_PATH.test(pathname)) return { scope, mode:'dev' };
  return null;
}

function securityHeaders(contentType) {
  return new Headers({
    'content-type':contentType,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://api.ekodi.kr; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
}
function previewHtml({ scope, mode }) {
  const label = scope === 'ekodibiz' ? 'EKODIBIZ' : 'EKODI';
  const platformHref = scope === 'ekodibiz' ? '/ekodibiz/preview/platform' : '/preview/platform';
  const devHref = scope === 'ekodibiz' ? '/ekodibiz/preview/dev' : '/preview/dev';
  const title = mode === 'dev' ? `${label} Developer Preview` : `${label} Platform Preview`;
  const description = mode === 'dev'
    ? '공개 가능한 기술 계약과 현재 서비스 상태를 개발자 관점에서 봅니다.'
    : '실제 운영 서비스의 현재 상태와 사용자 흐름을 안전한 공개 지도에서 봅니다.';
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="/preview/assets/preview.css"></head>
<body><main class="preview" data-preview-root data-scope="${scope}" data-mode="${mode}">
<header class="top"><a class="brand" href="/">EKODI</a><nav aria-label="Preview 관점"><a href="${platformHref}"${mode === 'platform' ? ' aria-current="page"' : ''}>Platform</a><a href="${devHref}"${mode === 'dev' ? ' aria-current="page"' : ''}>Developer</a></nav></header>
<section class="hero"><p class="eyebrow">LIVE SAFE PROJECTION</p><h1>${title}</h1><p>${description}</p>
<div class="live-line"><span class="live-dot" data-live-dot></span><strong data-live-label>현재 상태 연결 중</strong><time data-generated-at></time><button type="button" data-refresh>새로고침</button></div></section>
<section class="summary" aria-label="운영 상태 요약" data-summary></section>
<div class="view-tabs" role="tablist" aria-label="Preview 보기"></div>
<section class="view-host" data-view-host aria-live="polite"><p class="loading">실제 EKODI Registry와 운영 상태를 불러오는 중입니다.</p></section>
<footer><p>실제 운영계와 연결된 읽기 전용 공개 투영입니다. 개인정보·Secret·원시 로그·내부 소스 토폴로지는 표시하지 않습니다.</p></footer>
<script src="/preview/assets/preview.js" defer></script></main></body></html>`;
}
const PREVIEW_CSS = `
:root{color-scheme:light;--bg:#f5f6f3;--card:#fff;--ink:#17201c;--muted:#66706a;--line:#dce1dc;--accent:#245443;--soft:#eaf1ed;--ok:#17633f;--warn:#8a5a00;--bad:#9b2c2c;--unknown:#68736d;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}a{color:inherit}.preview{width:min(1180px,calc(100% - 32px));margin:auto;padding:24px 0 54px}.top{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:6px 0 24px}.brand{font-size:20px;font-weight:900;letter-spacing:-.04em;text-decoration:none}.top nav{display:flex;gap:8px}.top nav a{padding:9px 13px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:13px;font-weight:750;background:var(--card)}.top nav a[aria-current=page]{background:var(--ink);color:white;border-color:var(--ink)}
.hero{padding:54px 0 34px;max-width:850px}.eyebrow{margin:0 0 12px;color:var(--accent);font-size:11px;font-weight:850;letter-spacing:.16em}.hero h1{margin:0;font-size:clamp(38px,6vw,72px);line-height:1;letter-spacing:-.055em}.hero>p:not(.eyebrow){font-size:17px;line-height:1.7;color:var(--muted);max-width:720px}.live-line{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:22px;font-size:13px}.live-dot{width:9px;height:9px;border-radius:50%;background:var(--unknown)}.live-dot[data-state=online]{background:var(--ok)}.live-dot[data-state=degraded]{background:var(--warn)}.live-dot[data-state=offline]{background:var(--bad)}.live-line time{color:var(--muted)}button{font:inherit}.live-line button,.view-tabs button{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 11px;cursor:pointer}.live-line button:disabled{opacity:.55;cursor:progress}
.summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:0 0 28px}.summary article{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px}.summary small{display:block;color:var(--muted);font-size:11px}.summary strong{display:block;margin-top:5px;font-size:25px;letter-spacing:-.04em}.view-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.view-tabs button[aria-selected=true]{background:var(--accent);border-color:var(--accent);color:#fff}.view-host{min-height:320px}.loading,.empty,.error{padding:36px;border:1px dashed var(--line);border-radius:16px;color:var(--muted);text-align:center;background:rgba(255,255,255,.52)}.error{color:var(--bad);border-color:#e7c8c8}
.map{display:grid;gap:14px}.map-root{display:flex;justify-content:center}.root-node{min-width:220px;text-align:center;background:var(--ink);color:#fff;border-radius:18px;padding:18px}.root-node small{display:block;opacity:.7}.group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.group{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:17px}.group h2{margin:0 0 12px;font-size:14px}.service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.service{display:block;text-decoration:none;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fbfcfa;min-width:0}.service:hover{border-color:#aab6ad}.service-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.service strong{font-size:13px}.service small{display:block;margin-top:4px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.status{flex:none;font-size:10px;font-weight:800;border-radius:999px;padding:3px 7px;background:#eef0ee;color:var(--unknown)}.status.online{background:#e7f4ec;color:var(--ok)}.status.degraded{background:#fff3da;color:var(--warn)}.status.offline{background:#fae9e9;color:var(--bad)}
.table{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden}.table th,.table td{padding:12px 14px;text-align:left;border-bottom:1px solid var(--line);font-size:13px}.table tr:last-child td{border-bottom:0}.table th{font-size:11px;color:var(--muted);background:#f9faf8}.journey{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.journey article{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:17px}.journey b{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--soft);color:var(--accent)}.journey strong{display:block;margin:14px 0 7px}.journey p{margin:0;color:var(--muted);font-size:13px;line-height:1.55}.contracts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.contract{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:17px}.contract small{color:var(--accent);font-weight:800;text-transform:uppercase}.contract strong{display:block;margin:7px 0}.contract code{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}.notice{padding:14px 16px;border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--card);border-radius:12px;margin-bottom:14px;color:var(--muted);font-size:13px}.notice strong{color:var(--ink)}footer{margin-top:42px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;line-height:1.6}
@media(max-width:820px){.summary{grid-template-columns:repeat(3,minmax(0,1fr))}.group-grid,.contracts{grid-template-columns:1fr}.journey{grid-template-columns:1fr 1fr}.service-grid{grid-template-columns:1fr}}@media(max-width:540px){.preview{width:min(100% - 22px,1180px)}.top{align-items:flex-start}.top nav{flex-direction:column}.hero{padding-top:34px}.summary{grid-template-columns:1fr 1fr}.journey{grid-template-columns:1fr}.table-wrap{overflow-x:auto}.table{min-width:640px}}
`;const PREVIEW_JS = `
(()=>{'use strict';
const root=document.querySelector('[data-preview-root]');if(!root)return;
const scope=root.dataset.scope||'ekodi',mode=root.dataset.mode||'platform';
const host=root.querySelector('[data-view-host]'),tabs=root.querySelector('.view-tabs'),summary=root.querySelector('[data-summary]');
const refresh=root.querySelector('[data-refresh]'),liveLabel=root.querySelector('[data-live-label]'),liveDot=root.querySelector('[data-live-dot]'),generated=root.querySelector('[data-generated-at]');
const state={data:null,view:mode==='dev'?'tech':'map',timer:null,loading:false};
const views=mode==='dev'?[['tech','기술 지도'],['contracts','공개 계약'],['services','서비스 상태']]:[['map','생태계 지도'],['operations','운영 상태'],['journey','사용자 여정']];
const statusKo={online:'정상',degraded:'지연',offline:'확인 필요',unknown:'관측 없음'};
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(className)node.className=className;return node}
function time(value){if(!value)return'관측 없음';const d=new Date(value);return Number.isNaN(d.getTime())?'관측 없음':d.toLocaleString('ko-KR')}
function setLive(data){const s=data.summary||{};let overall='online';if(s.offline)overall='offline';else if(s.degraded||s.unknown)overall='degraded';liveDot.dataset.state=overall;liveLabel.textContent=s.offline?'일부 서비스 확인 필요':s.degraded||s.unknown?'실시간 연결 · 일부 관측 대기':'실시간 연결 정상';generated.textContent='갱신 '+time(data.generatedAt)}
function renderSummary(data){summary.replaceChildren();for(const [label,value] of [['전체',data.summary.total],['정상',data.summary.online],['지연',data.summary.degraded],['확인 필요',data.summary.offline],['관측 없음',data.summary.unknown]]){const card=el('article');card.append(el('small',label),el('strong',value));summary.append(card)}}
function badge(service){const b=el('span',statusKo[service.live.status]||'관측 없음','status '+service.live.status);b.title=service.live.checkedAt?'최근 확인 '+time(service.live.checkedAt):'현재 공개 관측값 없음';return b}
function serviceCard(service){const a=el('a',undefined,'service');a.href=service.url;a.target='_blank';a.rel='noopener noreferrer';const head=el('div',undefined,'service-head');head.append(el('strong',service.name),badge(service));a.append(head,el('small',service.label||service.url));return a}
function renderMap(data,developer=false){host.replaceChildren();if(developer){const note=el('div',undefined,'notice');const strong=el('strong','공개 기술 지도 · ');note.append(strong,document.createTextNode('내부 소스·DB·배포 토폴로지가 아니라 외부에 약속된 서비스 경계와 공개 상태만 표시합니다.'));host.append(note)}const map=el('div',undefined,'map'),top=el('div',undefined,'map-root'),rootNode=el('div',undefined,'root-node');rootNode.append(el('small',developer?'PUBLIC CONTRACT SURFACE':'LIVE PLATFORM'),el('strong',data.scope.label));top.append(rootNode);map.append(top);const grid=el('div',undefined,'group-grid');for(const group of data.groups){const box=el('section',undefined,'group');box.append(el('h2',group.label));const services=el('div',undefined,'service-grid');for(const service of data.services.filter(item=>item.group===group.id))services.append(serviceCard(service));box.append(services);grid.append(box)}map.append(grid);host.append(map)}
function renderOperations(data){host.replaceChildren();const wrap=el('div',undefined,'table-wrap'),table=el('table',undefined,'table'),head=el('thead'),hr=el('tr');for(const title of ['서비스','등록 상태','운영 관측','최근 확인'])hr.append(el('th',title));head.append(hr);const body=el('tbody');for(const service of data.services){const row=el('tr'),name=el('td'),a=el('a',service.name);a.href=service.url;a.target='_blank';a.rel='noopener noreferrer';name.append(a,el('small',' '+service.label));row.append(name,el('td',service.registryStatus),el('td',statusKo[service.live.status]||service.live.status),el('td',time(service.live.checkedAt)));body.append(row)}table.append(head,body);wrap.append(table);host.append(wrap)}
function renderJourney(data){host.replaceChildren();const note=el('div',undefined,'notice');note.append(el('strong','User Experience는 별도 Preview가 아닙니다. '),document.createTextNode('같은 Platform 데이터를 사용자의 흐름으로 읽는 관점입니다.'));host.append(note);const steps=[['1','접속','EKODI 또는 서비스에 들어옵니다.'],['2','인증','필요한 순간에 공통 인증으로 연결됩니다.'],['3','공간','자신의 조직·프로젝트 맥락을 선택합니다.'],['4','서비스','허용된 AI·전문서비스를 사용합니다.'],['5','이어짐','활동과 결과가 다음 작업과 연결됩니다.']];const grid=el('div',undefined,'journey');for(const [n,title,copy] of steps){const card=el('article');card.append(el('b',n),el('strong',title),el('p',copy));grid.append(card)}host.append(grid)}
function renderContracts(data){host.replaceChildren();const note=el('div',undefined,'notice');note.append(el('strong','Developer Preview는 운영 콘솔이 아닙니다. '),document.createTextNode('공개 가능한 계약만 보여주며 Secret·내부 환경·원시 Schema는 노출하지 않습니다.'));host.append(note);const grid=el('div',undefined,'contracts');for(const item of data.contracts||[]){const card=el('article',undefined,'contract'),link=el('a',item.name);link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';card.append(el('small',item.kind),link,el('code',item.url));grid.append(card)}host.append(grid)}
function render(){const data=state.data;if(!data)return;if(state.view==='map')renderMap(data);else if(state.view==='operations'||state.view==='services')renderOperations(data);else if(state.view==='journey')renderJourney(data);else if(state.view==='contracts')renderContracts(data);else renderMap(data,true)}
function mountTabs(){tabs.replaceChildren();for(const [id,label] of views){const button=el('button',label);button.type='button';button.role='tab';button.dataset.view=id;button.setAttribute('aria-selected',String(state.view===id));button.addEventListener('click',()=>{state.view=id;for(const item of tabs.querySelectorAll('button'))item.setAttribute('aria-selected',String(item===button));render()});tabs.append(button)}}
async function load(manual=false){if(state.loading)return;state.loading=true;refresh.disabled=true;if(manual)liveLabel.textContent='현재 상태 다시 확인 중';try{const endpoint=new URL('https://api.ekodi.kr/api/public/preview/map');endpoint.searchParams.set('scope',scope);endpoint.searchParams.set('mode',mode);const response=await fetch(endpoint,{cache:'no-store',headers:{accept:'application/json'}});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.json();if(data?.privacy?.secrets!==false||data?.privacy?.personalData!==false)throw new Error('safe projection contract mismatch');state.data=data;renderSummary(data);setLive(data);render()}catch(error){if(!state.data){host.replaceChildren(el('p','실시간 Preview 연결을 확인하지 못했습니다. 잠시 후 새로고침해 주세요.','error'))}liveDot.dataset.state='offline';liveLabel.textContent='실시간 연결 확인 필요';console.error('[EKODI Preview]',error)}finally{state.loading=false;refresh.disabled=false;schedule()}}
function schedule(){if(state.timer)clearTimeout(state.timer);if(document.visibilityState!=='visible')return;const seconds=Math.max(30,Math.min(300,Number(state.data?.refreshAfterSeconds)||60));state.timer=setTimeout(()=>load(false),seconds*1000)}
refresh.addEventListener('click',()=>load(true));document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load(false);else if(state.timer)clearTimeout(state.timer)});mountTabs();load(false);
})();
`;
export function isPreviewPath(pathname) {
  const path = String(pathname || '');
  return HUB_PATH.test(path) || PLATFORM_PATH.test(path) || DEV_PATH.test(path) || path.startsWith(ASSET_PREFIX);
}

export function handlePreviewRequest(request) {
  const url = new URL(request.url);
  if (!isPreviewPath(url.pathname)) return null;
  if (!['GET','HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status:405, headers:securityHeaders('text/plain; charset=utf-8') });
  if (HUB_PATH.test(url.pathname)) {
    const target = new URL(url);
    target.pathname = `${url.pathname.replace(/\/$/, '')}/platform`;
    return new Response(null, { status:308, headers:{ location:target.toString(), 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'x-ekodi-route':'live-preview-hub' } });
  }
  if (url.pathname === `${ASSET_PREFIX}preview.css`) return new Response(request.method === 'HEAD' ? null : PREVIEW_CSS, { status:200, headers:securityHeaders('text/css; charset=utf-8') });
  if (url.pathname === `${ASSET_PREFIX}preview.js`) return new Response(request.method === 'HEAD' ? null : PREVIEW_JS, { status:200, headers:securityHeaders('text/javascript; charset=utf-8') });
  const info = routeInfo(url.pathname);
  if (!info) return new Response('Not Found', { status:404, headers:securityHeaders('text/plain; charset=utf-8') });
  const response = new Response(request.method === 'HEAD' ? null : previewHtml(info), { status:200, headers:securityHeaders('text/html; charset=utf-8') });
  response.headers.set('x-ekodi-route', `live-preview-${info.scope}-${info.mode}`);
  response.headers.set('x-ekodi-preview-scope', info.scope);
  response.headers.set('x-ekodi-preview-mode', info.mode);
  return response;
}
