(() => {
  const API='https://mall-api.ekodi.kr';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  if(!window.supabase)return;
  const sb=window.supabase.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const $=(s)=>document.querySelector(s); const status=$('#connectorStatus'),login=$('#connectorLogin'),logout=$('#connectorLogout'),reload=$('#connectorReload');
  const providerReady=$('#providerReady'),lookupGate=$('#lookupGate'),credentialSummary=$('#credentialSummary'),nextRequired=$('#nextRequired'),lookupResult=$('#lookupResult'),dryRunResult=$('#dryRunResult');
  let session=null;
  function setStatus(msg,error=false){status.textContent=msg;status.dataset.state=error?'error':'ok';}
  async function token(){return (await sb.auth.getSession()).data.session?.access_token||'';}
  async function api(path,options={}){const t=await token();if(!t)throw new Error('운영자 Google 로그인이 필요합니다.');const h=new Headers(options.headers||{});h.set('authorization',`Bearer ${t}`);if(options.body&&!h.has('content-type'))h.set('content-type','application/json');const r=await fetch(`${API}${path}`,{...options,headers:h});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||`Mall API ${r.status}`);return b;}
  async function post(path,body){return api(path,{method:'POST',body:JSON.stringify(body)});}
  async function exchangeCentralToken(){const p=new URLSearchParams(location.hash.slice(1));const central=p.get('ekodi_token');if(!central)return;const type=p.get('ekodi_type')||'email';const {error}=await sb.auth.verifyOtp({token_hash:central,type});if(error)throw error;history.replaceState(null,'',location.pathname+location.search);}
  const card=(name,value)=>{const a=document.createElement('article'),s=document.createElement('small'),b=document.createElement('strong');s.textContent=name;b.textContent=value?'READY':'MISSING';a.append(s,b);return a;};
  async function load(){const r=await api('/api/internal/connectors/domemae/readiness');const x=r.readiness;providerReady.textContent=x.providerReady?'PROVIDER READY':'PROVIDER BLOCKED';lookupGate.textContent=x.gates.lookupEnabled?'ON':'OFF';credentialSummary.replaceChildren(card('API KEY',x.credentials.apiKeyConfigured),card('USER ID',x.credentials.userIdConfigured),card('SESSION',x.credentials.sessionConfigured),card('LOOKUP GATE',x.gates.lookupEnabled));nextRequired.textContent=x.nextRequired.length?`다음 필요: ${x.nextRequired.join(' · ')}`:'조회 준비가 완료되었습니다. 주문 실행은 계속 OFF입니다.';setStatus(`${r.actor} · Domemae provider ${x.providerReady?'READY':'BLOCKED'} · lookup ${x.capabilities.itemLookup?'READY':'LOCKED'} · order OFF`);}
  $('#itemLookupForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const itemNo=e.currentTarget.elements.itemNo.value;try{const r=await post('/api/internal/connectors/domemae/item-lookup',{itemNo});lookupResult.textContent=JSON.stringify(r.item,null,2);setStatus('공식 상품조회가 완료됐습니다. 원본 payload는 저장하지 않았습니다.');}catch(err){lookupResult.textContent=err.message;setStatus(err.message,true);}});
  $('#orderDryRunForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;try{const r=await post('/api/internal/connectors/domemae/order-dry-run',{itemNo:f.itemNo.value,quantity:f.quantity.value});dryRunResult.textContent=`실행 허용: ${r.executionAllowed?'YES':'NO'}\nBlockers: ${(r.blockers||[]).join('\n')}\n${r.note||''}`;setStatus('주문 Dry-run을 기록했습니다. 실제 주문 API는 호출하지 않았습니다.');}catch(err){dryRunResult.textContent=err.message;setStatus(err.message,true);}});
  login?.addEventListener('click',()=>{location.href='https://auth.ekodi.kr/?site=mall-seller&returnTo=https%3A%2F%2Fmall.ekodi.kr%2Fsupplier-connectors';});
  logout?.addEventListener('click',async()=>{await sb.auth.signOut();session=null;sync();setStatus('로그아웃했습니다.');});reload?.addEventListener('click',()=>load().catch((e)=>setStatus(e.message,true)));
  function sync(){const signed=Boolean(session);login.hidden=signed;logout.hidden=!signed;document.querySelectorAll('.ops-panel input,.ops-panel button').forEach((el)=>{el.disabled=!signed;});reload.disabled=!signed;}
  exchangeCentralToken().catch((e)=>setStatus(`인증 연결 실패: ${e.message}`,true)).finally(async()=>{session=(await sb.auth.getSession()).data.session;sync();if(session)load().catch((e)=>setStatus(e.message,true));});
  sb.auth.onAuthStateChange((_e,next)=>{session=next;sync();if(session)load().catch(()=>{});});
})();
