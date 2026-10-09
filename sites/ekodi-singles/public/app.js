(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page || '';
  const titles = {'':'처음','/discover':'동행 찾기','/groups':'우리 모임','/events':'행사','/messages':'메시지','/my':'나의 동행'};
  const messages = {
    '':'함께 믿고 걸어갈 사람들을 위한 공동체입니다. 운영 준비가 끝날 때까지 개인정보나 신청서를 받지 않습니다.',
    '/discover':'동행 추천은 성인 본인확인과 개별 동의, 상호 존중을 위한 안전장치가 완료된 후에만 제공됩니다.',
    '/groups':'신앙 공동체와 소그룹을 준비하고 있습니다. 아직 공개 승인된 모임이 없습니다.',
    '/events':'현재 공개 승인된 싱글 행사는 없습니다. 행사가 준비되면 날짜와 참여 방법을 공개하겠습니다.',
    '/messages':'대화는 서로 연결에 동의한 두 사람에게만 열립니다. 현재 메시지 기능은 비활성입니다.',
    '/my':'내 프로필은 기본 비공개입니다. 초기 가입과 동의는 보안 검수가 완료된 뒤에만 활성화됩니다.'
  };
  function setMessage(value){if($('enrollmentMessage'))$('enrollmentMessage').textContent=value}
  function safeText(value){return String(value??'').slice(0,250)}
  function showPublic(text){$('contentDescription').textContent=text}
  async function get(url, token){
    const headers=token?{'authorization':'Bearer '+token}:{};
    const r=await fetch(url,{headers,cache:'no-store',credentials:'omit'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||'요청을 완료하지 못했습니다.');
    return data;
  }
  async function renderPublic(){
    showPublic(messages[page]||messages['']);
    if(page!== '/events' && page!== '/groups')return;
    try{
      const publicData=await get('/singles/api/public');
      const key=page==='/events'?'events':'groups';
      const records=Array.isArray(publicData[key])?publicData[key]:[];
      const holder=$('publicList');
      holder.hidden=false;
      holder.replaceChildren();
      if(!records.length){
        holder.textContent=page==='/events'?'현재 공개 승인된 싱글 행사가 없습니다.':'현재 공개 승인된 싱글 모임이 없습니다.';
        return;
      }
      const list=document.createElement('ul');
      for(const record of records.slice(0,20)){
        // Only public-safe server projections; never innerHTML.
        const li=document.createElement('li');
        li.textContent=safeText(record.title||record.name);
        list.append(li);
      }
      holder.append(list);
    }catch{
      const holder=$('publicList');holder.hidden=false;holder.textContent='공개 목록을 불러오지 못했습니다.';
    }
  }
  async function initializeEnrollment(status){
    if(page!=='/my')return;
    if(!status?.onboarding_enabled||!status?.auth?.supabase_url||!status?.auth?.publishable_key){
      $('accountStatus').textContent='가입 및 민감정보 동의 기능은 아직 열리지 않았습니다.';
      return;
    }
    $('serviceStage').textContent='가입 검증 중';
    $('enrollmentPanel').hidden=false;
    $('publicPanel').hidden=true;
    if(typeof window.supabase?.createClient!=='function'){
      setMessage('인증 모듈을 사용할 수 없습니다. 다시 접속해 주세요.');
      return;
    }
    const sb=window.supabase.createClient(status.auth.supabase_url,status.auth.publishable_key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });
    let currentSession=(await sb.auth.getSession()).data.session;
    const authUrl=new URL('https://ekodi.kr/auth/');
    authUrl.searchParams.set('site','community');
    authUrl.searchParams.set('return_to','https://ekodi.kr/singles/my');
    $('loginButton').addEventListener('click',()=>{location.assign(authUrl.href)});
    if(!currentSession){
      $('accountStatus').textContent='EKODI 계정으로 로그인하면 개인 참여 의사를 설정할 수 있습니다.';
      return;
    }
    $('loginButton').hidden=true;
    $('consentForm').hidden=false;
    $('accountStatus').textContent='로그인 상태입니다. 프로필 노출과 연결 기능은 별도 확인 전까지 차단됩니다.';
    const form=$('consentForm');
    const sessionToken=async () => {
      const session=(await sb.auth.getSession()).data.session;
      if(!session?.access_token)throw new Error('로그인 상태가 만료됐습니다.');
      return session.access_token;
    };
    try{
      const data=await get('/singles/api/me',await sessionToken());
      if(data?.member?.status==='active'){
        form.elements.adult.checked=Boolean(data.member.age_19_confirmed);
        form.elements.base.checked=Boolean(data.member.base_consent);
        form.elements.sensitive.checked=Boolean(data.member.religion_consent);
        form.elements.marriage.checked=Boolean(data.member.marriage_opt_in);
      }
    }catch(e){if(e.message!=='member_not_found')setMessage('이전 참여 정보를 확인하지 못했습니다. '+safeText(e.message))}
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!form.elements.adult.checked||!form.elements.base.checked){
        setMessage('성인 자기확인과 기본 서비스 동의가 필요합니다.');return;
      }
      const submit=form.querySelector('button[type=submit]');submit.disabled=true;
      try{
        const r=await fetch('/singles/api/me',{
          method:'PUT',
          headers:{'content-type':'application/json','authorization':'Bearer '+await sessionToken()},
          credentials:'omit',cache:'no-store',
          body:JSON.stringify({
            age_19_confirmed:form.elements.adult.checked,
            base_consent:form.elements.base.checked,
            religion_consent:form.elements.sensitive.checked,
            marriage_opt_in:form.elements.marriage.checked
          })
        });
        const data=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(data.error||'저장에 실패했습니다.');
        setMessage('기본 참여 의사가 저장됐습니다. 프로필 검색과 연결은 계속 비활성입니다.');
      }catch(e){setMessage('저장되지 않았습니다. '+safeText(e.message))}
      finally{submit.disabled=false}
    });
    $('withdrawButton').addEventListener('click',async()=>{
      if(!confirm('참여 동의를 철회하고 서비스를 중단하시겠습니까?'))return;
      const button=$('withdrawButton');button.disabled=true;
      try{
        const r=await fetch('/singles/api/withdraw',{
          method:'DELETE',headers:{'authorization':'Bearer '+await sessionToken()},
          cache:'no-store',credentials:'omit'
        });
        const data=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(data.error||'철회 실패');
        form.reset();setMessage('동의 철회가 기록되었습니다. 연결 및 공개 상태는 비활성입니다.');
      }catch(e){setMessage('철회 요청을 처리하지 못했습니다. '+safeText(e.message))}
      finally{button.disabled=false}
    });
  }
  async function main(){
    $('sectionTitle').textContent=titles[page]||'처음';
    await renderPublic();
    try{
      const status=await get('/singles/api/status');
      if(status.onboarding_enabled)$('serviceStage').textContent='가입 안내';
      await initializeEnrollment(status);
    }catch{
      $('serviceStage').textContent='서비스 점검 중';
    }
  }
  main().catch(()=>{$('serviceStage').textContent='서비스 점검 중'});
})();
