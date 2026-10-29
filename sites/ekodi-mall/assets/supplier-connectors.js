(() => {
  const API='/ekodimall/api';
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
  async function load(){const r=await api('/api/internal/connectors/domemae/readiness');const x=r.readiness;providerReady.textContent=x.providerReady?'PROVIDER READY':'PROVIDER BLOCKED';lookupGate.textContent=x.gates.lookupEnabled?'ON':'OFF';credentialSummary.replaceChildren(card('API KEY',x.credentials.apiKeyConfigured),card('USER ID',x.credentials.userIdConfigured),card('LOGIN SECRET',x.credentials.passwordConfigured),card('APPROVED ACCOUNT',x.credentials.approvedMemberBindingReady),card('PROBE SWITCH',x.gates.readOnlyAuthProbeEnabled),card('LOOKUP GATE',x.gates.lookupEnabled));nextRequired.textContent=x.nextRequired.length?`다음 필요: ${x.nextRequired.join(' · ')}`:'조회 준비가 완료되었습니다. 주문 실행은 계속 OFF입니다.';
    const probe=x.readOnlyAuthProbe||{}, desc=probe.result==='ok'?'인증·잔액 조회 성공':probe.result==='failed'?'점검 실패':'점검 기록 없음';
    const checked=probe.checkedAt?new Date(probe.checkedAt).toLocaleString('ko-KR'):'미실행';
    const mismatch=probe.loginIdMatchesConfigured===false?' · ID 차이 감지(SNS 연동 가능)':probe.loginIdMatchesConfigured===true?' · ID 일치':'';
    const error=probe.errorCode?` · 오류 ${probe.errorCode}`:'';
    $('#readOnlyProbe').textContent=`읽기 전용 인증: ${probe.enabled?'ON':'OFF'} · ${desc} · 최근 ${checked}${mismatch}${error} · 실제 주문 OFF`;
    const hints={
      LOGIN_FAILED:'로그인 실패: SNS 가입 계정에 별도 비밀번호가 설정되어 있는지 확인하세요.',
      LOGIN_REJECTED:'로그인 거절: 별도 비밀번호와 Cloudflare DOMEMAE_PASSWORD를 확인하세요.',
      SNS_PASSWORD_REQUIRED:'SNS 가입 회원은 도매꾹 회원정보에서 별도 비밀번호를 설정해야 합니다.',
      PASSWORD_REJECTED:'비밀번호가 거절됐습니다. 도매꾹 계정과 Cloudflare Secret을 확인하세요.',
      MEMBER_ERROR:'회원 오류: 공급사 승인 회원과 실제 로그인 계정을 확인하세요.',
      PRIVATE_API_PERMISSION:'Private API 개별 승인 권한을 확인하세요.',
      CLIENT_IP_REJECTED:'도매꾹 기술지원팀에 요청 IP 설정을 문의하세요.',
      ACCOUNT_BINDING_MISMATCH:'회원 식별자 불일치: 승인 계정·로그인 응답을 확인하세요.',
      ASSET_PROBE_FAILED:'로그인은 통과했으나 잔액 조회에 실패했습니다.'
    };
    $('#probeHelp').textContent=probe.result==='ok'?'로그인·잔액 조회 성공. 유상 자동발주와 배송정보 전송은 OFF입니다.':hints[probe.errorCode]||'SNS 계정이라면 도매꾹 회원정보에서 비밀번호를 설정하고 Cloudflare Secret을 변경하세요. 비밀번호를 이 화면에 입력하지 마세요.';
    setStatus(`${r.actor} · Domemae provider ${x.providerReady?'READY':'BLOCKED'} · lookup ${x.capabilities.itemLookup?'READY':'LOCKED'} · order OFF`);}
  $('#authProbeRetry')?.addEventListener('click',async()=>{
    const btn=$('#authProbeRetry');btn.disabled=true;
    try{
      const r=await post('/api/internal/connectors/domemae/auth-probe',{}),p=r.probe||{};
      if(p.skipped==='recent')setStatus('인증 재시도 간격 제한.'+(p.nextEligibleAt?' 다음 가능: '+new Date(p.nextEligibleAt).toLocaleString('ko-KR'):''),true);
      else if(p.skipped)setStatus('승인 회원/비밀번호 Secret 미충족. 공급사 API는 호출하지 않았습니다.',true);
      else setStatus(p.ok?'읽기 전용 로그인·잔액 점검 성공. 발주 OFF 유지':'로그인 점검 실패: '+(p.errorCode||'LOGIN_FAILED'),!p.ok);
      await load();
    }catch(err){setStatus(err.message,true);}
    finally{btn.disabled=!session;}
  });
  $('#itemLookupForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const itemNo=e.currentTarget.elements.itemNo.value;try{const r=await post('/api/internal/connectors/domemae/item-lookup',{itemNo});lookupResult.textContent=JSON.stringify(r.item,null,2);setStatus('공식 상품조회가 완료됐습니다. 원본 payload는 저장하지 않았습니다.');}catch(err){lookupResult.textContent=err.message;setStatus(err.message,true);}});
  $('#orderDryRunForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget.elements;try{const r=await post('/api/internal/connectors/domemae/order-dry-run',{itemNo:f.itemNo.value,quantity:f.quantity.value});dryRunResult.textContent=`실행 허용: ${r.executionAllowed?'YES':'NO'}\nBlockers: ${(r.blockers||[]).join('\n')}\n${r.note||''}`;setStatus('주문 Dry-run을 기록했습니다. 실제 주문 API는 호출하지 않았습니다.');}catch(err){dryRunResult.textContent=err.message;setStatus(err.message,true);}});
  login?.addEventListener('click',()=>{location.href='https://ekodi.kr/auth/?site=mall-seller&return_to='+encodeURIComponent(location.href.split('#')[0]);});
  logout?.addEventListener('click',async()=>{await sb.auth.signOut();session=null;sync();setStatus('로그아웃했습니다.');});reload?.addEventListener('click',()=>load().catch((e)=>setStatus(e.message,true)));
  function sync(){const signed=Boolean(session);login.hidden=signed;logout.hidden=!signed;document.querySelectorAll('.ops-panel input,.ops-panel button').forEach((el)=>{el.disabled=!signed;});reload.disabled=!signed;}
  exchangeCentralToken().catch((e)=>setStatus(`인증 연결 실패: ${e.message}`,true)).finally(async()=>{session=(await sb.auth.getSession()).data.session;sync();if(session)load().catch((e)=>setStatus(e.message,true));});
  sb.auth.onAuthStateChange((_e,next)=>{session=next;sync();if(session)load().catch(()=>{});});
})();
