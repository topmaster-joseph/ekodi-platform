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
  ['POST /api/control/ai/actions', true],
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
    *{box-sizing:border-box}html{background:var(--bg)}body{margin:0;background:radial-gradient(circle at 82% -8%,rgba(123,215,200,.12),transparent 32rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,a,textarea{font:inherit}a{color:inherit;text-decoration:none}button{cursor:pointer}.top{position:sticky;top:0;z-index:20;padding-top:env(safe-area-inset-top);background:rgba(7,17,31,.9);backdrop-filter:blur(18px);border-bottom:1px solid rgba(123,215,200,.12)}.top-inner{max-width:1240px;margin:auto;min-height:54px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-weight:850;letter-spacing:.08em}.badge{font-size:10px;letter-spacing:.08em;color:var(--accent);border:1px solid rgba(123,215,200,.25);border-radius:999px;padding:6px 9px}.wrap{max-width:1240px;margin:auto;padding:18px 20px 34px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.15em;color:var(--accent)}h1{font-size:clamp(32px,4.5vw,52px);line-height:1;letter-spacing:-.04em;margin:6px 0 8px}.lead{max-width:940px;margin:0;font-size:15px;line-height:1.48;color:var(--muted)}
    .summary{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:11px;color:var(--muted);font-size:13px}.dot{width:9px;height:9px;border-radius:50%;background:var(--warn);box-shadow:0 0 0 4px rgba(245,205,120,.07)}.dot.ok{background:var(--ok);box-shadow:0 0 0 4px rgba(140,229,181,.07)}.dot.bad{background:var(--bad);box-shadow:0 0 0 4px rgba(255,157,157,.07)}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.button,button{border:1px solid var(--line);border-radius:10px;min-height:38px;padding:0 13px;background:rgba(255,255,255,.025);color:var(--text);font-weight:760;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--accent);border-color:var(--accent);color:#07131b}.button:hover,button:hover{transform:translateY(-1px)}.login{margin-top:14px;padding:16px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.018)}.login h2{margin:0 0 5px;font-size:18px}.login p{margin:0;color:var(--muted);line-height:1.45}.identity{margin-left:auto;font-size:11px;color:var(--ok);font-weight:750}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.card{border:1px solid var(--line);border-radius:14px;padding:13px 14px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.012));min-height:108px}.card small{font-size:9px;letter-spacing:.12em;color:var(--muted)}.card h2{margin:5px 0 4px;font-size:17px}.state{font-weight:850;font-size:15px}.state.ok{color:var(--ok)}.state.warn{color:var(--warn)}.state.bad{color:var(--bad)}.meta{margin-top:5px;color:var(--muted);font-size:11px;line-height:1.42}
    .testbar{margin-top:10px;border:1px solid var(--line);border-radius:13px;padding:9px 11px;background:var(--panel2);display:flex;align-items:center;gap:10px}.testbar-copy{min-width:0;flex:1}.testbar strong{display:block;font-size:13px}.testbar p{margin:2px 0 0;color:var(--muted);font-size:11px;line-height:1.35}.testbar button{min-height:34px;white-space:nowrap}.result{min-width:210px;max-width:420px;color:var(--muted);font-size:11px;line-height:1.35;white-space:pre-wrap}
    .chatbox{margin-top:10px;border:1px solid var(--line);border-radius:17px;background:linear-gradient(180deg,rgba(255,255,255,.022),rgba(255,255,255,.01));min-height:430px;height:min(55vh,650px);display:flex;flex-direction:column;overflow:hidden}.chat-head{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:14px}.chat-title small{display:block;font-size:9px;letter-spacing:.13em;color:var(--accent)}.chat-title h2{margin:3px 0 0;font-size:17px}.provider-strip{display:flex;align-items:center;gap:7px;min-width:0;font-size:11px}.provider-label{color:var(--muted)}.provider-pill{border:1px solid rgba(123,215,200,.26);background:rgba(123,215,200,.07);color:var(--accent);padding:5px 8px;border-radius:999px;font-weight:800}.model-name{color:var(--muted);max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .chat-messages{flex:1;overflow:auto;padding:16px 14px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin}.message{display:flex;flex-direction:column;gap:4px;max-width:min(82%,850px)}.message.user{align-self:flex-end;align-items:flex-end}.message.assistant,.message.system{align-self:flex-start}.bubble{padding:10px 12px;border-radius:14px;white-space:pre-wrap;line-height:1.52;font-size:14px;background:#122137;border:1px solid rgba(255,255,255,.04)}.message.user .bubble{background:rgba(123,215,200,.14);border-color:rgba(123,215,200,.18)}.message.system .bubble{font-size:12px;color:var(--warn);background:rgba(245,205,120,.07);border-color:rgba(245,205,120,.16)}.message-meta{font-size:10px;color:var(--muted);padding:0 3px}.chat-status{min-height:18px;padding:0 14px 5px;color:var(--muted);font-size:11px}.chat-status.error{color:var(--bad)}.composer{border-top:1px solid var(--line);padding:10px 12px;background:rgba(7,17,31,.55)}.compose-row{display:flex;align-items:flex-end;gap:8px}.composer textarea{flex:1;resize:none;min-height:48px;max-height:150px;border:1px solid var(--line);border-radius:12px;background:#091625;color:var(--text);padding:11px 12px;outline:none;line-height:1.42}.composer textarea:focus{border-color:rgba(123,215,200,.55);box-shadow:0 0 0 3px rgba(123,215,200,.06)}.composer button{min-width:78px;min-height:48px}.chat-hint{margin-top:5px;color:var(--muted);font-size:10px}.foot{margin-top:13px;padding-top:10px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);line-height:1.5}[hidden]{display:none!important}
    @media(max-width:980px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.testbar{align-items:flex-start}.result{min-width:0}.chatbox{height:58vh}}
    @media(max-width:640px){.top-inner{min-height:50px;padding-left:14px;padding-right:14px}.wrap{padding:14px 14px 28px}.badge{display:none}h1{font-size:34px}.lead{font-size:14px}.grid{grid-template-columns:1fr}.identity{width:100%;margin-left:17px}.testbar{display:grid;grid-template-columns:1fr auto}.result{grid-column:1/-1}.chat-head{align-items:flex-start}.provider-strip{flex-wrap:wrap;justify-content:flex-end}.message{max-width:92%}.compose-row{align-items:stretch}.composer button{min-width:64px}.actions>.button,.actions>button{flex:1 1 130px}}
  </style>
</head><body>
  <header class="top"><div class="top-inner"><a class="brand" href="https://ekodi.kr/">EKODI · AI GATEWAY</a><span class="badge">ADMIN · PROVIDER INDEPENDENT</span></div></header>
  <main class="wrap">
    <div class="eyebrow">CORE FIRST · AI ENHANCED</div>
    <h1>EKODI AI Gateway</h1>
    <p class="lead">EKODI Core는 계속 살아 있고, 외부 AI는 교체 가능한 보조 계층으로 연결됩니다. 실제 사용 중인 Provider와 Model을 확인하면서 대화와 운영 명령을 한 화면에서 실행할 수 있습니다.</p>
    <div class="summary"><span class="dot" id="overallDot"></span><strong id="overallText">상태 확인 대기</strong><span id="checkedAt"></span><span class="identity" id="sessionIdentity"></span></div>

    <section class="login" id="signedOut">
      <h2 id="loginTitle">관리자 인증이 필요합니다</h2>
      <p id="loginMessage">AI 공급자 상태와 실제 운영 요청은 EKODI 관리자에게만 공개됩니다.</p>
      <div class="actions"><a class="button primary" id="loginButton" href="${loginUrl}">Google 관리자 인증</a><a class="button" href="https://admin.ekodi.kr/#ai-ops">Admin AI Ops</a></div>
    </section>

    <section id="signedIn" hidden>
      <div class="actions"><button class="primary" id="refreshBtn" type="button">↻ 상태 새로고침</button><a class="button" href="https://admin.ekodi.kr/#ai-ops">Admin AI Ops</a><a class="button" href="https://marketing.ekodi.kr/">Marketing AI</a><button id="logoutBtn" type="button">로그아웃</button></div>
      <div class="grid">
        <article class="card"><small>EKODI CORE AI GATEWAY</small><h2>Gateway</h2><div class="state" id="gatewayState">확인 중</div><div class="meta" id="gatewayMeta">Core 우선 · Provider 독립</div></article>
        <article class="card"><small>ACTIVE AI PROVIDER</small><h2>Provider</h2><div class="state" id="openaiState">확인 중</div><div class="meta" id="openaiMeta">서버 측 연결 상태 확인 중</div></article>
        <article class="card"><small>FAILURE MODE</small><h2>Fallback</h2><div class="state" id="fallbackState">확인 중</div><div class="meta" id="fallbackMeta">외부 AI 장애 시에도 Core 기능 유지</div></article>
        <article class="card"><small>SECURITY</small><h2>Credentials</h2><div class="state ok">서버 전용</div><div class="meta">API Key는 브라우저에 전달하지 않습니다. Provider와 Model 상태만 표시합니다.</div></article>
      </div>
      <section class="testbar">
        <div class="testbar-copy"><strong>실제 연결 테스트</strong><p>실제 Provider 호출을 한 번 실행해 현재 경로를 확인합니다.</p></div>
        <button class="primary" id="testBtn" type="button">연결 테스트</button>
        <div class="result" id="testResult">연결 테스트 전</div>
      </section>
      <section class="chatbox" aria-label="EKODI AI 대화와 운영 명령">
        <header class="chat-head"><div class="chat-title"><small>AI COMMAND CONSOLE</small><h2>대화 · 운영 명령</h2></div><div class="provider-strip"><span class="provider-label">현재 AI</span><span class="provider-pill" id="activeProvider">확인 중</span><span class="model-name" id="activeModel">-</span></div></header>
        <div class="chat-messages" id="chatMessages" aria-live="polite"><div class="message assistant"><div class="bubble">여기에서 질문하거나 운영 요청을 입력하세요. 실제 응답을 처리한 AI와 Model을 각 메시지에 표시합니다.</div><div class="message-meta">EKODI AI Gateway</div></div></div>
        <div class="chat-status" id="chatStatus">대기 중</div>
        <form class="composer" id="chatForm"><div class="compose-row"><textarea id="chatInput" rows="2" maxlength="1800" placeholder="예: 현재 상태를 점검해줘 · 이 화면의 배치를 더 압축해줘"></textarea><button class="primary" id="chatSendBtn" type="submit">보내기</button></div><div class="chat-hint">Enter 전송 · Shift+Enter 줄바꿈 · 변경 요청은 안전 경계에 따라 실행·대기·승인으로 분류됩니다.</div></form>
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
'use strict';const TOKEN_KEY='ekodi-auth-token';
const HANDOFF_KEY='ekodi_admin_token';
const TOKEN_PATTERN=/^[a-f0-9]{64}$/i;
const HEALTH_RE=/(상태|점검|장애|이상|느려|오류|health|status|incident)/i;
const ACTION_RE=/(수정|바꿔|변경|고쳐|조치|적용|구축|연동|배포|재구성|정리|없애|옮겨|추가|만들어|fix|change|deploy|build|connect|apply|update)/i;
const HIGH_RISK=[
  {re:/(계약|법적|위약|서명|contract)/i,area:'legal_commitment_or_contract_execution'},
  {re:/(고액|대금|지불|결제|환불|가격|요금|수수료|financial|payment|refund)/i,area:'high_value_or_exceptional_financial_commitment'},
  {re:/(전체\s*삭제|대량\s*삭제|초기화|drop|테이블\s*삭제|db\s*삭제)/i,area:'destructive_or_mass_data_change'},
  {re:/(개인정보|identity\s*merge|계정\s*병합|privacy)/i,area:'identity_merge_or_irreversible_privacy_change'},
  {re:/(관리자\s*권한|권한\s*(삭제|해제|축소)|user\s*rights)/i,area:'policy_change_that_materially_reduces_user_rights'},
  {re:/(도메인\s*(이전|삭제)|서비스\s*(종료|폐쇄)|ownership\s*transfer|shutdown)/i,area:'domain_service_shutdown_or_ownership_transfer'},
];
const $=id=>document.getElementById(id);
let memoryToken='';
let handoffPresent=false;
let aiHistory=[];
let currentProvider='';
let currentModel='';
function storedToken(){try{return sessionStorage.getItem(TOKEN_KEY)||memoryToken}catch{return memoryToken}}
function setToken(value){memoryToken=String(value||'');try{if(memoryToken)sessionStorage.setItem(TOKEN_KEY,memoryToken);else sessionStorage.removeItem(TOKEN_KEY)}catch{}return Boolean(memoryToken)}
function acceptHandoff(){const hash=new URLSearchParams(location.hash.replace(/^#/,''));const value=String(hash.get(HANDOFF_KEY)||'').trim();if(!TOKEN_PATTERN.test(value))return false;handoffPresent=true;setToken(value);return true}
function clearHandoff(){if(!handoffPresent)return;history.replaceState({},document.title,location.pathname+location.search);handoffPresent=false}
function authHeaders(json=false){const headers={};const value=storedToken();if(value)headers.authorization='Bearer '+value;if(json)headers['content-type']='application/json';return headers}
async function request(path,options={}){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),18000);try{const response=await fetch(path,{...options,headers:{...authHeaders(Boolean(options.body)),...(options.headers||{})},cache:'no-store',signal:options.signal||controller.signal});let data={};try{data=await response.json()}catch{}if(!response.ok)throw Object.assign(new Error(data.error||('HTTP '+response.status)),{status:response.status,data});return data}finally{clearTimeout(timeout)}}
function signedIn(on){$('signedIn').hidden=!on;$('signedOut').hidden=on}
function state(id,text,tone=''){const el=$(id);if(!el)return;el.textContent=text;el.className='state'+(tone?' '+tone:'')}
function overall(text,tone=''){const dot=$('overallDot');if(dot)dot.className='dot'+(tone?' '+tone:'');$('overallText').textContent=text}
function loginMessage(title,message){$('loginTitle').textContent=title;$('loginMessage').textContent=message}
function stamp(){const now=new Date();$('checkedAt').textContent=' · '+now.toLocaleString('ko-KR')}
function context(){return {section:'ai-gateway',title:'EKODI AI Gateway',pathname:location.pathname}}
function providerName(value,mode){const name=String(value||'').trim();if(name)return name==='openai'?'OpenAI':name;if(mode==='ai')return 'AI Provider';return 'EKODI Core'}
function setProvider(provider,model,mode){currentProvider=providerName(provider,mode);currentModel=String(model||'').trim();const p=$('activeProvider');const m=$('activeModel');if(p)p.textContent=currentProvider;if(m)m.textContent=currentModel||((mode==='ai')?'model 확인 중':'Fallback / Core')}
function remember(role,text){const value=String(text||'').trim();if(!value)return;aiHistory.push({role,text:value.slice(0,2000)});if(aiHistory.length>8)aiHistory=aiHistory.slice(-8)}
function actionLabel(status){const map={waiting_human:'담당자 확인 대기',awaiting_human:'승인 대기',verified:'실행 확인',ready_for_executor:'실행 대기',approved_pending_executor:'승인됨',assist_only:'검토 기록',blocked:'차단',failed:'실패',executing:'실행 중'};return map[status]||status||'운영 큐 기록'}
function highRiskArea(text){return HIGH_RISK.find(item=>item.re.test(text))?.area||''}
function renderStatus(data){const gateway=data.gateway||{};const openai=data.openai||{};const mode=String(gateway.mode||'core');const aiReady=Boolean(openai.configured&&openai.available&&!gateway.providerDisabled);state('gatewayState',mode==='ai'?'AI 사용 가능':mode==='free_assist'?'Fallback 준비':'Core 전용',mode==='ai'?'ok':'warn');$('gatewayMeta').textContent='정책 '+(gateway.policyVersion||'-')+' · Provider '+Number(gateway.providerCount||0)+'개 · Core 독립 '+(gateway.providerIndependent?'유지':'확인 필요');state('openaiState',openai.configured?(openai.available?'OpenAI 연결 준비':'구성 확인 필요'):'미구성',aiReady?'ok':'warn');$('openaiMeta').textContent='Model '+(openai.model||'-')+' · 실제 응답 Provider는 대화별 표시';state('fallbackState',gateway.providerIndependent?'정상 준비':'확인 필요',gateway.providerIndependent?'ok':'bad');$('fallbackMeta').textContent=gateway.notice||'외부 AI 장애 또는 미설정 시 EKODI Core / Free Assist로 계속 운영';setProvider(aiReady?'openai':'',aiReady?openai.model:'',aiReady?'ai':mode);overall(aiReady?'OpenAI 구성 정상 · 실제 호출 확인 가능':gateway.providerIndependent?'Core 정상 · AI Provider 확인 필요':'AI Gateway 확인 필요',aiReady?'ok':'');stamp()}
async function refresh(){overall('상태 확인 중');$('refreshBtn').disabled=true;try{const data=await request('/api/control/ai/provider-status');renderStatus(data)}catch(error){if(error.status===401||error.status===403){setToken('');signedIn(false);$('sessionIdentity').textContent='';loginMessage('관리자 세션이 만료되었습니다','Google 관리자 인증을 다시 진행해 주세요.');overall('관리자 인증 필요','bad');return}overall(error.name==='AbortError'?'상태 확인 지연':'상태 API 확인 필요','bad');state('gatewayState','확인 실패','bad');$('gatewayMeta').textContent=error.name==='AbortError'?'상태 서버 응답이 지연되고 있습니다.':error.message}finally{$('refreshBtn').disabled=false}}
function addMessage(role,text,meta=''){const box=$('chatMessages');if(!box||!document.createElement)return;const row=document.createElement('div');row.className='message '+role;const bubble=document.createElement('div');bubble.className='bubble';bubble.textContent=String(text||'');row.appendChild(bubble);if(meta){const info=document.createElement('div');info.className='message-meta';info.textContent=meta;row.appendChild(info)}box.appendChild(row);box.scrollTop=box.scrollHeight}
function setChatStatus(text,error=false){const el=$('chatStatus');if(!el)return;el.textContent=text;el.className='chat-status'+(error?' error':'')}
async function liveTest(){const button=$('testBtn');button.disabled=true;$('testResult').textContent='실제 Provider를 호출하고 있습니다…';try{const data=await request('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message:'연결 상태 확인입니다. EKODI AI 연결 확인이라고 짧게 응답해 주세요.',context:context()})});const direct=data.mode==='ai'&&data.provider;const name=providerName(data.provider,data.mode);setProvider(data.provider,data.model,data.mode);$('testResult').textContent=direct?'✓ '+name+' · '+(data.model||'-')+' · 실제 응답 정상':'Fallback · '+(data.notice||'Core 정상');overall(direct?name+' 실제 호출 정상':'Fallback 동작 · Core 정상',direct?'ok':'');stamp()}catch(error){$('testResult').textContent='실패 · '+(error.name==='AbortError'?'응답 시간 초과':error.message);overall('연결 테스트 확인 필요','bad')}finally{button.disabled=false}}
async function queueOperationalRequest(text){const c=context();const risky=highRiskArea(text);if(risky){return request('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'admin.gateway_command',area:risky,target:c.section,rationale:text,payload:{source:'ai-gateway-chat',context:c,request:text},reversible:false,delegated:true,preflightVerified:false,reducesUserRights:risky==='policy_change_that_materially_reduces_user_rights'})})}if(HEALTH_RE.test(text)){return request('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:text,payload:{source:'ai-gateway-chat',context:c},reversible:true,delegated:true,preflightVerified:true})})}if(!ACTION_RE.test(text))return null;let preflight=false;try{const check=await request('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'service.health_check',area:'health_checks',target:c.section,rationale:'Gateway 명령 사전점검: '+text,payload:{source:'ai-gateway-chat',context:c},reversible:true,delegated:true,preflightVerified:true})});preflight=Boolean(check.ok)}catch{}return request('/api/control/ai/actions',{method:'POST',body:JSON.stringify({agentId:'chief',actionType:'ui.change_request',area:'bounded_admin_change',target:c.section,rationale:text,payload:{source:'ai-gateway-chat',context:c,request:text},reversible:true,delegated:true,preflightVerified:preflight})})}
async function sendChat(text){const message=String(text||'').trim().slice(0,1800);if(!message)return;const send=$('chatSendBtn');const input=$('chatInput');if(send)send.disabled=true;if(input)input.disabled=true;addMessage('user',message,'관리자');setChatStatus('요청을 분류하고 Provider를 호출 중입니다.');const history=aiHistory.slice(-8);remember('user',message);try{let queued=null;try{queued=await queueOperationalRequest(message)}catch(queueError){addMessage('system','운영 요청 큐 기록은 실패했습니다: '+queueError.message,'안전 경계');}const result=await request('/api/control/ai/assist',{method:'POST',body:JSON.stringify({message,context:context(),history})});const reply=String(result.reply||'응답을 받지 못했습니다.').trim();remember('assistant',reply);setProvider(result.provider,result.model,result.mode);const meta=providerName(result.provider,result.mode)+(result.model?' · '+result.model:'')+(queued?' · '+actionLabel(queued.status):'');addMessage('assistant',reply,meta);if(queued)setChatStatus('운영 요청 '+actionLabel(queued.status)+' · 실제 처리 상태는 안전 정책에 따라 기록됩니다.');else setChatStatus('응답 완료 · '+providerName(result.provider,result.mode));if(result.notice)addMessage('system',result.notice,'Gateway notice')}catch(error){addMessage('system','요청 실패: '+(error.name==='AbortError'?'응답 시간이 초과되었습니다.':error.message),'Gateway');setChatStatus('요청 처리 실패',true)}finally{if(send)send.disabled=false;if(input){input.disabled=false;input.focus()}}}
async function validate(){const handed=acceptHandoff();const value=storedToken();if(!value){signedIn(false);loginMessage('관리자 인증이 필요합니다','AI 공급자 상태와 실제 운영 요청은 EKODI 관리자에게만 공개됩니다.');overall('관리자 인증 필요');return}if(handed){signedIn(true);overall('Google 관리자 인증 완료 · 세션 확인 중','ok');$('sessionIdentity').textContent='인증 확인 중'}try{const session=await request('/api/session');if(!session.authenticated)throw Object.assign(new Error('관리자 세션이 확인되지 않았습니다.'),{status:401});signedIn(true);clearHandoff();$('sessionIdentity').textContent=(session.email||'관리자')+' · '+(session.role||'admin');overall('관리자 인증 정상 · AI 상태 확인 중','ok');await refresh()}catch(error){clearHandoff();if(error.status===401||error.status===403){setToken('');signedIn(false);$('sessionIdentity').textContent='';loginMessage('Google 인증은 완료됐지만 EKODI 세션 확인에 실패했습니다','등록된 관리자 계정인지 확인한 뒤 다시 인증해 주세요. 문제가 계속되면 Admin AI Ops에서 세션 상태를 함께 확인합니다.');overall('관리자 세션 확인 실패','bad')}else{signedIn(true);overall(error.name==='AbortError'?'세션 확인 지연':'세션 확인 네트워크 오류','bad');loginMessage('세션 확인이 지연되고 있습니다','EKODI Core는 계속 동작합니다. 상태 새로고침으로 다시 확인할 수 있습니다.')}}}
$('refreshBtn')?.addEventListener('click',refresh);
$('testBtn')?.addEventListener('click',liveTest);
$('chatForm')?.addEventListener('submit',event=>{event.preventDefault();const input=$('chatInput');const text=input?.value||'';if(input)input.value='';sendChat(text)});
$('chatInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();const input=$('chatInput');const text=input?.value||'';if(input)input.value='';sendChat(text)}});$('logoutBtn')?.addEventListener('click',async()=>{try{await request('/api/logout',{method:'POST'})}catch{}setToken('');clearHandoff();signedIn(false);$('sessionIdentity').textContent='';loginMessage('관리자 인증이 필요합니다','AI 공급자 상태와 실제 운영 요청은 EKODI 관리자에게만 공개됩니다.');overall('로그아웃 완료')});
validate();
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
