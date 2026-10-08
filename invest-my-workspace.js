// /my/invest: future paid service is disabled. Only the verified owner can use private research tools.
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','vary':'authorization'};
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const DEFAULT_OWNER='topmaster.joseph@gmail.com';
const ownerEmail=env=>String(env.INVEST_OWNER_EMAIL||env.ADMIN_EMAIL||DEFAULT_OWNER).trim().toLowerCase();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEAD,'content-type':'application/json; charset=utf-8'}});
function tokenFrom(request){
 const raw=String(request.headers.get('authorization')||'');
 const match=raw.match(/^Bearer ([A-Za-z0-9._~+/-]{12,8192})$/i);
 return match?match[1]:'';
}
async function ownerAuthority(request,env){
 const token=tokenFrom(request);
 if(!token)return {ok:false,status:401,error:'authentication_required'};
 // EKODI shared Google/Supabase member identity. Check a confirmed owner address.
 let memberResponse;
 try{memberResponse=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(memberResponse?.ok){
  const member=await memberResponse.json().catch(()=>null);
  if(member?.id&&member?.email_confirmed_at){
   return String(member.email||'').toLowerCase()===ownerEmail(env)
    ? {ok:true,subject:String(member.id),method:'verified-member'}
    : {ok:false,status:403,error:'subscription_not_active'};
  }
 }
 // Existing EKODI platform admin token is a separate, server-validated credential.
 let adminResponse;
 try{adminResponse=await fetch('https://ekodi.kr/api/session',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(6000),cache:'no-store'})}catch{}
 if(adminResponse?.ok){
  const admin=await adminResponse.json().catch(()=>null);
  if(admin?.authenticated===true&&admin.role==='super_admin'&&String(admin.email||'').toLowerCase()===ownerEmail(env)){
   return {ok:true,subject:'owner',method:'verified-admin'};
  }
 }
 return {ok:false,status:403,error:'subscription_not_active'};
}
export async function investMyRoute(request,env){
 const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
 if(!['/invest','/invest/access','/invest/app.js'].includes(path))return null;
 if(!['GET','HEAD'].includes(request.method))return json({error:'method_not_allowed'},405);
 if(path==='/invest/access'){
  const decision=await ownerAuthority(request,env);
  return decision.ok?json({ok:true,scope:'self-research',paidSubscriptionActive:false,publicPaidAdvisoryActive:false,liveTradingEnabled:false,subject:'verified-owner'})
    :json({ok:false,error:decision.error},decision.status);
 }
 if(path==='/invest/app.js')return new Response(ownerBrowserJs(),{headers:{...HEAD,'content-type':'application/javascript; charset=utf-8'}});
 return new Response(request.method==='HEAD'?null:ownerHtml(),{headers:{...HEAD,'content-type':'text/html; charset=utf-8'}});
}
function ownerHtml(){
 const style=':root{font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;background:#fff;color:#151a16}body{margin:0}main{max-width:960px;margin:auto;padding:20px 18px 70px;line-height:1.6}header{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding-bottom:14px}a{color:#1f4a34}h1{font-size:clamp(27px,5vw,42px)}h2{font-size:19px}p{color:#555}.notice{padding:15px;border:1px solid #d4dbd5;border-radius:10px;background:#f7f8f7;margin:15px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}label{display:grid;gap:5px;font-size:13px}input,select,textarea{padding:10px;border:1px solid #c8d0c8;border-radius:8px;font:inherit;width:100%;box-sizing:border-box}button{padding:11px 17px;background:#214b34;color:white;border:0;border-radius:8px;cursor:pointer;font-weight:700}button:disabled{background:#999}article{padding:15px;border:1px solid #ddd;border-radius:10px}[hidden]{display:none!important}footer{border-top:1px solid #ddd;margin-top:30px;padding-top:15px;font-size:12px;color:#777}';
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>마이투자 · EKODI</title><style>'+style+'</style></head><body><main><header><a href="/invest">EKODI 투자</a><a href="/my">My EKODI</a></header><h1>마이투자</h1><div class="notice">일반회원용 유료 구독 및 개인별 투자자문은 구축 준비 상태로 비활성화되어 있습니다. 최고관리자 본인의 연구·시나리오 분석 도구만 별도 인증 후 이용할 수 있습니다.</div><p id="authMessage" role="status">개인 분석 권한을 확인합니다.</p><section id="owner" hidden><h2>본인 전용 투자 시나리오 분석</h2><p>계산은 이 기기에서 수행되며 입력한 자산정보는 서버로 전송하거나 저장하지 않습니다. 실제 시장 데이터가 연결되지 않은 상태이므로 종목 매수·매도 자문은 제공하지 않습니다.</p><div class="grid"><label>분석 투자금 (원)<input id="capital" type="number" min="0" max="1000000000000" step="10000" value="10000000"></label><label>투자기간<select id="horizon"><option value="0.0833">1개월</option><option value="0.25">3개월</option><option value="1" selected>1년</option><option value="3">3년</option></select></label><label>희망 연수익률 (%)<input id="target" type="number" min="-100" max="100" step="0.5" value="10"></label><label>감내 가능한 손실률 (%)<input id="loss" type="number" min="0" max="100" step="0.5" value="10"></label><label>최대 단일 종목 비중 (%)<input id="concentration" type="number" min="0" max="100" step="1" value="25"></label><label>현금 보유 비중 (%)<input id="cash" type="number" min="0" max="100" step="1" value="20"></label></div><p><button id="calculate" type="button">내 투자 시나리오 분석</button></p><section id="summary" class="notice" aria-live="polite">입력값에 따라 상승 목표와 하락 손실을 비교합니다.</section><h2>개인 투자 검토 질문</h2><label>보유종목과 검토내용 (기기에서만 입력)<textarea id="notes" rows="3" maxlength="1500" placeholder="종목명·보유비중·검토할 위험"></textarea></label><p><button id="copy" type="button">내 분석 질문 복사</button></p></section><footer>최고관리자 검증 없이 개인 분석 결과를 불러오지 않습니다. 모든 실거래·유료 자문 권한은 비활성화 상태입니다.</footer></main><script src="/my/invest/app.js" defer></script></body></html>';
}
function ownerBrowserJs(){
 const js=[
 "(()=>{'use strict';",
 "const el=id=>document.getElementById(id);",
 "const login='/auth/?site=my&return_to='+encodeURIComponent('https://ekodi.kr/my/invest');",
 "const tokens=()=>{const out=[];try{const s=JSON.parse(localStorage.getItem('ekodi_platform_session_v1')||'null');if(s?.access_token)out.push(s.access_token)}catch{}try{const admin=sessionStorage.getItem('ekodi-auth-token');if(admin)out.push(admin)}catch{}return out};",
 "const format=x=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(Math.round(x));",
 "function compute(){const cap=Number(el('capital').value),h=Number(el('horizon').value),gain=Number(el('target').value),loss=Number(el('loss').value),c=Number(el('concentration').value),cash=Number(el('cash').value);if(![cap,h,gain,loss,c,cash].every(Number.isFinite)||cap<0||cap>1e12||gain< -100||gain>100||loss<0||loss>100||c<0||c>100||cash<0||cash>100){el('summary').textContent='입력값의 범위를 확인해 주세요.';return}const growth=cap*Math.pow(1+gain/100,h),drawdown=cap*(1-loss/100),notes=[];if(c>25)notes.push('단일 종목 집중도가 높아 손실 확대 가능성을 점검하세요.');if(cash<10)notes.push('현금 비중이 낮아 긴급 자금 수요를 별도로 검토하세요.');if(h<1&&gain>20)notes.push('짧은 기간의 높은 목표수익률은 변동성이 큰 전략을 유도할 수 있습니다.');if(!notes.length)notes.push('자금 용도·분산·손실 감내 범위를 함께 검토하세요.');el('summary').replaceChildren();const para=document.createElement('p');para.textContent='가정상 목표금액 '+format(growth)+'원 · 목표 차익 '+format(growth-cap)+'원 · 감내 손실 시 '+format(drawdown)+'원 (손실 '+format(cap-drawdown)+'원)';const info=document.createElement('p');info.textContent='단순 복리 가정으로 세금·수수료·변동성을 반영하지 않은 예시이며 실제 수익 예측이 아닙니다.';const warning=document.createElement('p');warning.textContent=notes.join(' ');el('summary').append(para,info,warning)}",
 "async function copy(){const text='투자금 '+el('capital').value+'원, 기간 '+el('horizon').selectedOptions[0].text+', 목표 연수익률 '+el('target').value+'%, 감내손실 '+el('loss').value+'%, 최대 종목비중 '+el('concentration').value+'%, 현금 '+el('cash').value+'%. 검토 내용: '+el('notes').value+'\\n이 조건을 고려해 출처·기준시점·상승/하락 시나리오와 손실위험을 비교해 주세요. 매수·매도 지시는 제외합니다.';try{await navigator.clipboard.writeText(text);el('copy').textContent='복사 완료'}catch{el('copy').textContent='복사 실패'}}",
 "async function verify(){const all=tokens();if(!all.length){el('authMessage').textContent='최고관리자 또는 EKODI 구글 로그인이 필요합니다. ';const a=document.createElement('a');a.href=login;a.textContent='로그인';el('authMessage').append(a);return}for(const token of all){try{const r=await fetch('/my/invest/access',{headers:{authorization:'Bearer '+token},cache:'no-store'});if(!r.ok)continue;const data=await r.json();if(data.ok&&data.scope==='self-research'){el('authMessage').textContent='본인 전용 연구 기능이 활성화되었습니다.';el('owner').hidden=false;compute();return}}catch{}}el('authMessage').textContent='일반회원 마이투자는 비활성화 상태입니다. 최고관리자 계정으로 다시 로그인해 주세요. ' ;const a=document.createElement('a');a.href=login;a.textContent='로그인';el('authMessage').append(a)}",
 "el('calculate')?.addEventListener('click',compute);el('copy')?.addEventListener('click',copy);verify();",
 "})();"
 ];
 return js.join('\n');
}
