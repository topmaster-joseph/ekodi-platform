const GOV24_HOME='https://www.gov.kr/';
const GOV24_RESIDENT_EXCERPT='https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000015';
const GOV24_SIGNATURE_FACT='https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13110000047&tp_seq=01';

function headers(){
  return {
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store',
    'x-robots-tag':'noindex, nofollow, noarchive',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-surface-context':'government-document-assistant'
  };
}

function page(){
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>공공민원 서류 발급 도우미 · EKODI</title>
<style>
:root{color-scheme:light;--ink:#173226;--muted:#617368;--line:#dbe5de;--bg:#f5f8f4;--card:#fff;--accent:#245c3f;--warn:#845b16}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{width:min(920px,calc(100% - 28px));margin:0 auto;padding:24px 0 60px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:18px}
h1{font-size:clamp(26px,5vw,40px);margin:0;letter-spacing:-.03em}.sub{color:var(--muted);margin:6px 0 0}
.grid{display:grid;gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}.card h2{font-size:18px;margin:0 0 8px}.meta{font-size:13px;color:var(--muted);margin:0 0 14px}
.actions{display:flex;flex-wrap:wrap;gap:8px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:11px 14px;text-decoration:none;font-weight:750;border:1px solid var(--accent);color:#fff;background:var(--accent)}
.btn.secondary{background:#fff;color:var(--accent)}.note{margin-top:18px;border:1px solid #ead9b8;background:#fffaf0;border-radius:14px;padding:14px;color:#654814}
.prefs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.choice{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer}.choice[aria-pressed="true"]{border-color:var(--accent);font-weight:800}
.small{font-size:12px;color:var(--muted);line-height:1.55}.status{display:inline-block;font-size:12px;font-weight:800;border:1px solid var(--line);border-radius:999px;padding:4px 8px;margin-bottom:10px}
@media(max-width:620px){.top{align-items:flex-start;flex-direction:column}.actions .btn{width:100%}}
</style>
</head>
<body>
<main>
  <div class="top"><div><h1>공공민원 서류 발급 도우미</h1><p class="sub">상권활성화 조합 구성 등 제출 목적별로 필요한 서류와 발급 경로를 한 화면에서 관리합니다.</p></div><a class="btn secondary" href="/my/">My EKODI</a></div>

  <section class="card" aria-labelledby="task-title">
    <span class="status">현재 작업</span>
    <h2 id="task-title">상권활성화 조합 구성 제출서류</h2>
    <p class="meta">필요 서류를 발급 가능 방식에 따라 구분합니다. EKODI는 본인인증을 우회하거나 인증서 비밀번호를 보관하지 않습니다.</p>
    <div class="prefs" aria-label="인증 선호">
      <button class="choice" data-auth="simple" type="button">간편인증 우선</button>
      <button class="choice" data-auth="certificate" type="button">공동·금융인증서 사용</button>
      <button class="choice" data-auth="ask" type="button">매번 선택</button>
    </div>
    <p class="small">선택값은 이 기기의 브라우저에만 저장되며 정부24 인증정보나 인증서 자체는 저장하지 않습니다.</p>
  </section>

  <div class="grid" style="margin-top:12px">
    <section class="card">
      <span class="status">온라인 발급 가능</span>
      <h2>주민등록표 초본</h2>
      <p class="meta">정부24에서 인터넷 발급 가능. 회원 또는 비회원 신청이 가능하며 과정 중 본인인증이 요구될 수 있습니다.</p>
      <div class="actions">
        <a class="btn" href="${GOV24_RESIDENT_EXCERPT}" target="_blank" rel="noreferrer">정부24에서 발급 시작</a>
        <button class="btn secondary" id="residentDone" type="button">발급완료 표시</button>
      </div>
    </section>

    <section class="card">
      <span class="status">방문 발급</span>
      <h2>본인서명사실확인서</h2>
      <p class="meta">인감증명서와 동일 효력의 서류지만 현재 정부24 안내 기준으로 본인서명사실확인서는 시·군·구청 또는 읍·면·동 주민센터 방문 발급입니다.</p>
      <div class="actions">
        <a class="btn" href="${GOV24_SIGNATURE_FACT}" target="_blank" rel="noreferrer">정부24 안내 확인</a>
        <button class="btn secondary" id="signatureDone" type="button">발급완료 표시</button>
      </div>
    </section>

    <section class="card">
      <span class="status">조건부 온라인</span>
      <h2>전자본인서명확인서</h2>
      <p class="meta">온라인 발급형을 사용하려면 최초 1회 읍·면·동 주민센터에서 발급시스템 이용 승인 신청이 필요합니다. 이 최초 승인은 EKODI가 생략하거나 대행할 수 없습니다.</p>
      <div class="actions"><a class="btn secondary" href="${GOV24_HOME}" target="_blank" rel="noreferrer">정부24 열기</a></div>
    </section>
  </div>

  <div class="note"><strong>인증 절차 최소화 원칙</strong><br>EKODI는 가능한 경우 간편인증을 우선 안내하고, 이미 유효한 정부24 로그인 세션이 있으면 그대로 이어서 사용합니다. 다만 정부24가 요구하는 본인확인, 최초 이용승인, 전자서명 또는 보안 절차를 우회하지 않습니다.</div>
</main>
<script>
const key='ekodi.govdocs.authPreference';
const buttons=[...document.querySelectorAll('[data-auth]')];
function applyAuth(v){buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.auth===v)));localStorage.setItem(key,v)}
buttons.forEach(b=>b.addEventListener('click',()=>applyAuth(b.dataset.auth)));
applyAuth(localStorage.getItem(key)||'simple');
for(const [id,keyName] of [['residentDone','resident-excerpt'],['signatureDone','signature-fact']]){
  const button=document.getElementById(id);
  const stateKey='ekodi.govdocs.done.'+keyName;
  const render=()=>{button.textContent=localStorage.getItem(stateKey)==='1'?'발급완료 ✓':'발급완료 표시'};
  button.addEventListener('click',()=>{localStorage.setItem(stateKey,localStorage.getItem(stateKey)==='1'?'0':'1');render()});
  render();
}
</script>
</body>
</html>`;
}

export function handleGovernmentDocuments(request){
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  const html=page();
  return new Response(request.method==='HEAD'?null:html,{status:200,headers:headers()});
}
