const API_ORIGIN = 'https://api.ekodi.kr';
export const AI_GATEWAY_HOST = 'ai.ekodi.kr';

const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://auth.ekodi.kr",
  "object-src 'none'",
].join('; ');

const API_PROXY_ROUTES = new Map([
  ['GET /api/session', true],
  ['GET /api/control/ai/provider-status', true],
  ['POST /api/control/ai/assist', true],
  ['POST /api/logout', true],
]);

function secureHeaders(contentType, routeName) {
  return new Headers({
    'content-type': contentType,
    'cache-control': 'no-store',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=()',
    'content-security-policy': PAGE_CSP,
    'x-ekodi-route': routeName,
  });
}

function pageHtml() {
  const loginUrl = 'https://auth.ekodi.kr/?site=admin&direct=1&return_to=https%3A%2F%2Fai.ekodi.kr%2F';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07111f">
  <title>EKODI AI Gateway</title>
  <style>
    :root{color-scheme:dark;--bg:#07111f;--panel:#0c192a;--panel2:#0a1524;--line:#20344d;--text:#f5f8fc;--muted:#9fb0c4;--accent:#7bd7c8;--ok:#8ce5b5;--warn:#f5cd78;--bad:#ff9d9d}
    *{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at 82% -8%,rgba(123,215,200,.14),transparent 34rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,a{font:inherit}a{color:inherit;text-decoration:none}button{cursor:pointer}.top{position:sticky;top:0;z-index:20;padding-top:env(safe-area-inset-top);background:rgba(7,17,31,.88);backdrop-filter:blur(18px);border-bottom:1px solid rgba(123,215,200,.12)}.top-inner{max-width:1120px;margin:auto;min-height:66px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-weight:850;letter-spacing:.08em}.badge{font-size:11px;letter-spacing:.08em;color:var(--accent);border:1px solid rgba(123,215,200,.25);border-radius:999px;padding:7px 10px}.wrap{max-width:1120px;margin:auto;padding:48px 20px 72px}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.16em;color:var(--accent)}h1{font-size:clamp(36px,6vw,66px);line-height:1.02;letter-spacing:-.045em;margin:12px 0 18px}.lead{max-width:780px;font-size:clamp(16px,2vw,19px);line-height:1.75;color:var(--muted)}.summary{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:23px;color:var(--muted)}.dot{width:10px;height:10px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 5px rgba(245,205,120,.08)}.dot.ok{background:var(--ok);box-shadow:0 0 0 5px rgba(140,229,181,.08)}.dot.bad{background:var(--bad);box-shadow:0 0 0 5px rgba(255,157,157,.08)}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.button,button{border:1px solid var(--line);border-radius:12px;min-height:44px;padding:0 15px;background:rgba(255,255,255,.025);color:var(--text);font-weight:760;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--accent);border-color:var(--accent);color:#07131b}.button:hover,button:hover{transform:translateY(-1px)}.login{margin-top:34px;padding:22px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.018)}.login h2{margin:0 0 7px;font-size:20px}.login p{margin:0;color:var(--muted);line-height:1.6}.identity{margin-left:auto;font-size:12px;color:var(--ok);font-weight:750}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:34px}.card{border:1px solid var(--line);border-radius:18px;padding:20px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.012));min-height:154px}.card small{font-size:11px;letter-spacing:.12em;color:var(--muted)}.card h2{margin:9px 0 9px;font-size:22px}.state{font-weight:850;font-size:18px}.state.ok{color:var(--ok)}.state.warn{color:var(--warn)}.state.bad{color:var(--bad)}.meta{margin-top:10px;color:var(--muted);font-size:13px;line-height:1.65}.testbox{margin-top:14px;border:1px solid var(--line);border-radius:18px;padding:20px;background:var(--panel2)}.testbox-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.testbox h2{margin:0 0 7px;font-size:20px}.testbox p{margin:0;color:var(--muted);font-size:13px;line-height:1.6}.result{margin-top:15px;padding:14px;border-radius:13px;background:rgba(255,255,255,.025);color:var(--muted);white-space:pre-wrap;line-height:1.6;min-height:52px}.foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);line-height:1.7}[hidden]{display:none!important}@media(max-width:720px){.top-inner{min-height:58px;padding-left:16px;padding-right:16px}.wrap{padding:34px 16px 56px}.grid{grid-template-columns:1fr}.identity{width:100%;margin-left:20px}.testbox-head{display:block}.testbox-head button{width:100%;margin-top:14px}.actions>.button,.actions>button{flex:1 1 160px}}
  </style>
</head>
<body>
  <header class="top"><div class="top-inner"><a class="brand" href="https://ekodi.kr/">EKODI · AI GATEWAY</a><span class="badge">ADMIN · PROVIDER INDEPENDENT</span></div></header>
  <main class="wrap">
    <div class="eyebrow">CORE FIRST · AI ENHANCED</div>
    <h1>EKODI AI Gateway</h1>
    <p class="lead">EKODI Core는 계속 살아 있고, 외부 AI는 교체 가능한 보조 계층으로 연결됩니다. 이 화면은 OpenAI와 EKODI AI의 연결 상태를 확인하며 비밀키는 표시하지 않습니다.</p>
    <div class="summary"><span class="dot" id="overallDot"></span><strong id="overallText">상태 확인 대기</strong><span id="checkedAt"></span><span class="identity" id="sessionIdentity"></span></div>

    <section class="login" id="signedOut">
      <h2 id="loginTitle">관리자 인증이 필요합니다</h2>
      <p id="loginMessage">AI 공급자 상태와 실제 호출 테스트는 EKODI 관리자에게만 공개됩니다.</p>
      <div class="actions"><a class="button primary" id="loginButton" href="${loginUrl}">Google 관리자 인증</a><a class="button" href="https://admin.ekodi.kr/#ai-ops">Admin AI Ops</a></div>
    </section>

    <section id="signedIn" hidden>
      <div class="actions"><button class="primary" id="refreshBtn" type="button">↻ 상태 새로고침</button><a class="button" href="https://admin.ekodi.kr/#ai-ops">Admin AI Ops</a><a class="button" href="https://marketing.ekodi.kr/">Marketing AI</a><button id="logoutBtn" type="button">로그아웃</button></div>
      <div class="grid">
        <article class="card"><small>EKODI CORE AI GATEWAY</small><h2>Gateway</h2><div class="state" id="gatewayState">확인 중</div><div class="meta" id="gatewayMeta">Core 우선 · Provider 독립</div></article>
        <article class="card"><small>AI PROVIDER CONNECTION</small><h2>OpenAI</h2><div class="state" id="openaiState">확인 중</div><div class="meta" id="openaiMeta">서버 측 연결 상태 확인 중</div></article>
        <article class="card"><small>FAILURE MODE</small><h2>Fallback</h2><div class="state" id="fallbackState">확인 중</div><div class="meta" id="fallbackMeta">외부 AI 장애 시에도 Core 기능 유지</div></article>
        <article class="card"><small>SECURITY</small><h2>Credentials</h2><div class="state ok">서버 전용</div><div class="meta">API Key는 브라우저에 전달하거나 표시하지 않습니다. 상태값만 안전하게 확인합니다.</div></article>
      </div>
      <section class="testbox">
        <div class="testbox-head"><div><h2>실제 연결 테스트</h2><p>버튼을 누를 때만 OpenAI 실제 호출을 시도합니다. 성공하면 Provider·Model을 확인하며, 실패하면 EKODI fallback이 작동합니다. 소량의 API 사용량이 발생할 수 있습니다.</p></div><button class="primary" id="testBtn" type="button">실제 연결 테스트</button></div>
        <div class="result" id="testResult">아직 실제 호출을 실행하지 않았습니다.</div>
      </section>
    </section>
    <footer class="foot">Root <strong>ai.ekodi.kr</strong>은 EKODI AI Gateway 운영 진입점입니다. <strong>*.ai.ekodi.kr</strong>의 고객 Marketing AI 워크스페이스 네임스페이스는 그대로 유지됩니다.</footer>
  </main>
  <script src="/ai-gateway.js" defer></script>
</body>
</html>`;
}

function clientScript() {
  return `(()=>{
'use strict';
const TOKEN_KEY='ekodi-auth-token';
const HANDOFF_KEY='ekodi_admin_token';
const TOKEN_PATTERN=/^[a-f0-9]{64}$/i;
const $=id=>document.getElementById(id);
let memoryToken='';
let handoffPresent=false;
function storedToken(){try{return sessionStorage.getItem(TOKEN_KEY)||memoryToken}catch{return memoryToken}}
function setToken(value){memoryToken=String(value||'');try{if(memoryToken)sessionStorage.setItem(TOKEN_KEY,memoryToken);else sessionStorage.removeItem(TOKEN_KEY)}catch{}return Boolean(memoryToken)}
function acceptHandoff(){const hash=new URLSearchParams(location.hash.replace(/^#/,''));const value=String(hash.get(HANDOFF_KEY)||'').trim();if(!TOKEN_PATTERN.test(value))return false;handoffPresent=true;setToken(value);return true}
function clearHandoff(){if(!handoffPresent)return;history.replaceState({},document.title,location.pathname+location.search);handoffPresent=false}
function authHeaders(json=false){const headers={};const value=storedToken();if(value)headers.authorization='Bearer '+value;if(json)headers['content-type']='application/json';return headers}
async function request(path,options={}){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(path,{...options,headers:{...authHeaders(Boolean(options.body)),...(options.headers||{})},cache:'no-store',signal:options.signal||controller.signal});let data={};try{data=await response.json()}catch{}if(!response.ok)throw Object.assign(new Error(data.error||('HTTP '+response.status)),{status:response.status,data});return data}finally{clearTimeout(timeout)}}
function signedIn(on){$('signedIn').hidden=!on;$('signedOut').hidden=on}
function state(id,text,tone=''){const el=$(id);if(!el)return;el.textContent=text;el.className='state'+(tone?' '+tone:'')}
function overall(text,tone=''){const dot=$('overallDot');if(dot)dot.className='dot'+(tone?' '+tone:'');$('overallText').textContent=text}
function loginMessage(title,message){$('loginTitle').textContent=title;$('loginMessage').textContent=message}
function stamp(){const now=new Date();$('checkedAt').textContent=' · '+now.toLocaleString('ko-KR')}
function renderStatus(data){const gateway=data.gateway||{};const openai=data.openai||{};const mode=String(gateway.mode||'core');const aiReady=Boolean(openai.configured&&openai.available&&!gateway.providerDisabled);state('gatewayState',mode==='ai'?'AI 사용 가능':mode==='free_assist'?'Fallback 준비':'Core 전용',mode==='ai'?'ok':'warn');$('gatewayMeta').textContent='정책 '+(gateway.policyVersion||'-')+' · Provider '+Number(gateway.providerCount||0)+'개 · Core 독립 '+(gateway.providerIndependent?'유지':'확인 필요');state('openaiState',openai.configured?(openai.available?'구성됨 · 런타임 준비':'구성 확인 필요'):'미구성',aiReady?'ok':'warn');$('openaiMeta').textContent='Model '+(openai.model||'-')+' · 실제 네트워크 응답은 아래 연결 테스트에서 확인';state('fallbackState',gateway.providerIndependent?'정상 준비':'확인 필요',gateway.providerIndependent?'ok':'bad');$('fallbackMeta').textContent=gateway.notice||'OpenAI 장애 또는 미설정 시 EKODI Core / Free Assist로 계속 운영';overall(aiReady?'OpenAI 구성 정상 · 실제 호출 확인 가능':gateway.providerIndependent?'Core 정상 · AI Provider 확인 필요':'AI Gateway 확인 필요',aiReady?'ok':'');stamp()}
async function refresh(){overall('상태 확인 중');$('refreshBtn').disabled=true;try{const data=await request('/api/control/ai/provider-status');renderStatus(data)}catch(error){if(error.status===401||error.status===403){setToken('');signedIn(false);$('sessionIdentity').textContent='';loginMessage('관리자 세션이 만료되었습니다','Google 관리자 인증을 다시 진행해 주세요.');overall('관리자 인증 필요','bad');return}overall(error.name==='AbortError'?'상태 확인 지연':'상태 API 확인 필요','bad');state('gatewayState','확인 실패','bad');$('gatewayMeta').textContent=error.name==='AbortError'?'상태 서버 응답이 지연되고 있습니다.':error.message}finally{$('refreshBtn').disabled=false}}
async function liveTest(){const button=$('testBtn');button.disabled=true;$('testResult').textContent='OpenAI 실제 호출을 확인하고 있습니다…';try{const data=await request('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message:'연결 상태 확인입니다. EKODI AI 연결 확인이라고 짧게 응답해 주세요.',context:{section:'ai-gateway',title:'EKODI AI Gateway',pathname:location.pathname}})});const direct=data.mode==='ai'&&data.provider==='openai';$('testResult').textContent=direct?'✅ 실제 연결 정상\\nProvider: OpenAI\\nModel: '+(data.model||'-')+'\\n응답: '+(data.reply||'정상'):'⚠️ OpenAI 직접 응답 대신 EKODI Fallback 동작\\nMode: '+(data.mode||'-')+'\\n'+(data.notice||data.reply||'Core 기능은 계속 이용할 수 있습니다.');overall(direct?'OpenAI 실제 호출 정상':'Fallback 동작 · Core 정상',direct?'ok':'');stamp()}catch(error){$('testResult').textContent='❌ 실제 연결 테스트 실패\\n'+(error.name==='AbortError'?'응답 시간이 초과되었습니다.':error.message);overall('연결 테스트 확인 필요','bad')}finally{button.disabled=false}}
async function validate(){const handed=acceptHandoff();const value=storedToken();if(!value){signedIn(false);loginMessage('관리자 인증이 필요합니다','AI 공급자 상태와 실제 호출 테스트는 EKODI 관리자에게만 공개됩니다.');overall('관리자 인증 필요');return}if(handed){signedIn(true);overall('Google 관리자 인증 완료 · 세션 확인 중','ok');$('sessionIdentity').textContent='인증 확인 중'}try{const session=await request('/api/session');if(!session.authenticated)throw Object.assign(new Error('관리자 세션이 확인되지 않았습니다.'),{status:401});signedIn(true);clearHandoff();$('sessionIdentity').textContent=(session.email||'관리자')+' · '+(session.role||'admin');overall('관리자 인증 정상 · AI 상태 확인 중','ok');await refresh()}catch(error){clearHandoff();if(error.status===401||error.status===403){setToken('');signedIn(false);$('sessionIdentity').textContent='';loginMessage('Google 인증은 완료됐지만 EKODI 세션 확인에 실패했습니다','등록된 관리자 계정인지 확인한 뒤 다시 인증해 주세요. 문제가 계속되면 Admin AI Ops에서 세션 상태를 함께 확인합니다.');overall('관리자 세션 확인 실패','bad')}else{signedIn(true);overall(error.name==='AbortError'?'세션 확인 지연':'세션 확인 네트워크 오류','bad');loginMessage('세션 확인이 지연되고 있습니다','EKODI Core는 계속 동작합니다. 상태 새로고침으로 다시 확인할 수 있습니다.')}}}
$('refreshBtn')?.addEventListener('click',refresh);$('testBtn')?.addEventListener('click',liveTest);$('logoutBtn')?.addEventListener('click',async()=>{try{await request('/api/logout',{method:'POST'})}catch{}setToken('');clearHandoff();signedIn(false);$('sessionIdentity').textContent='';loginMessage('관리자 인증이 필요합니다','AI 공급자 상태와 실제 호출 테스트는 EKODI 관리자에게만 공개됩니다.');overall('로그아웃 완료')});validate();
})();`;
}

export function aiGatewayPage() {
  return new Response(pageHtml(), { status: 200, headers: secureHeaders('text/html; charset=utf-8', 'ai-gateway') });
}

export function aiGatewayScript() {
  return new Response(clientScript(), { status: 200, headers: secureHeaders('application/javascript; charset=utf-8', 'ai-gateway-asset') });
}

export async function proxyAiGatewayApi(request) {
  const url = new URL(request.url);
  const routeKey = `${request.method.toUpperCase()} ${url.pathname}`;
  if (!API_PROXY_ROUTES.has(routeKey)) return null;

  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The Control API currently recognizes the admin origin. The browser never
  // receives provider credentials; the Gateway remains a same-origin proxy.
  headers.set('origin', 'https://admin.ekodi.kr');
  headers.set('referer', 'https://admin.ekodi.kr/');
  headers.set('x-ekodi-ai-gateway', 'root');

  try {
    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method.toUpperCase()) ? undefined : request.body,
      redirect: 'manual',
    });
    const responseHeaders = secureHeaders(upstream.headers.get('content-type') || 'application/json; charset=utf-8', 'ai-gateway-api-proxy');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  } catch {
    return new Response(JSON.stringify({ error: 'AI Gateway upstream connection failed', code: 'AI_GATEWAY_UPSTREAM_ERROR' }), {
      status: 502,
      headers: secureHeaders('application/json; charset=utf-8', 'ai-gateway-api-proxy'),
    });
  }
}
