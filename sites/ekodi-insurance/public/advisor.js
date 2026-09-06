(() => {
  const DEV_API='https://ekodi-insurance-api-staging.ekodi-development.workers.dev';
  const PROD_API='https://insurance-api.ekodi.kr';
  const API=location.hostname==='ins.ekodi.kr'?PROD_API:DEV_API;
  const ACCESS_KEY='ekodi-advisor-consultation-access-v1';
  let profile=null;
  const $=s=>document.querySelector(s);
  const status=(text,error=false)=>{const el=$('#advisorConsultStatus');if(!el)return;el.textContent=text;el.dataset.error=error?'true':'false'};
  const safeText=(el,value,fallback='')=>{if(el)el.textContent=String(value||fallback)};
  async function loadProfile(){
    try{
      const r=await fetch(`${API}/api/advisor/profile`,{cache:'no-store'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`profile ${r.status}`);
      profile=d.profile;
      safeText($('#profileBadge'),`${profile.insurerName} · ${profile.roleLabel}`);
      safeText($('#advisorName'),profile.displayName);
      safeText($('#advisorRole'),`${profile.insurerName} ${profile.roleLabel}`);
      safeText($('#profileIntro'),profile.intro,'기존 보험을 먼저 이해하고 필요한 설명만 이어가는 개인 상담 공간입니다.');
      safeText($('#registrationRef'),`모집인 확인정보 · ${profile.registrationReference}`);
      safeText($('#reviewNotice'),`개인 설계사 안내 페이지 · 광고검토 ${profile.advertisingReviewRef}`);
      if(profile.verificationUrl)$('#verificationLink').href=profile.verificationUrl;
      if(profile.officialCompanyUrl)$('#companyLink').href=profile.officialCompanyUrl;
      const design=$('#directDesignLink');if(design){const direct=profile.directDesignUrl||'',wonder=profile.wonderOfficialUrl||'';design.href=direct||wonder||profile.officialCompanyUrl||'#';design.textContent=direct?'나의 원더 직접 설계하기 ↗':'원더 공식 안내 보기 ↗';}
      const design=$('#directDesignLink');if(design)design.href=profile.directDesignUrl||profile.wonderOfficialUrl||'https://ntc.lotteins.co.kr/landing.do';
      const btn=$('#advisorConsultSubmit');btn.disabled=false;btn.textContent='상담 요청 등록';
      status('프로필과 상담 경로가 확인되었습니다.');
    }catch(error){
      console.warn('advisor profile unavailable',error);
      safeText($('#profileBadge'),'프로필 검증 준비 중');
      safeText($('#advisorName'),'개인 설계사 사이트 준비 중');
      safeText($('#advisorRole'),'모집인 확인정보와 광고검토 후 공개됩니다.');
      const btn=$('#advisorConsultSubmit');btn.disabled=true;btn.textContent='공개 준비 중';
      status('현재 프로필 공개 게이트가 닫혀 있어 상담요청을 받지 않습니다.',true);
    }
  }
  function saveAccess(consultation,accessToken){
    if(!consultation?.id||!accessToken)return;
    let items=[];try{items=JSON.parse(localStorage.getItem(ACCESS_KEY)||'[]')}catch{}
    items=Array.isArray(items)?items.filter(x=>x?.id!==consultation.id):[];
    items.unshift({id:consultation.id,accessToken,createdAt:consultation.createdAt});
    localStorage.setItem(ACCESS_KEY,JSON.stringify(items.slice(0,10)));
  }
  async function submit(event){
    event.preventDefault();if(!profile)return;
    const form=event.currentTarget,btn=$('#advisorConsultSubmit');
    const data=Object.fromEntries(new FormData(form));
    if(!form.elements.contactConsent.checked){status('상담 연락정보 처리 동의가 필요합니다.',true);return}
    btn.disabled=true;status('상담요청을 안전하게 등록하는 중입니다.');
    try{
      const r=await fetch(`${API}/api/consultations`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        name:String(data.advisorName||'').trim(),contact:String(data.advisorContact||'').trim(),preferredTime:String(data.preferredTime||''),summaryCode:String(data.topic||'GENERAL'),shareConsent:true,shareTranscript:false,messages:[],advisorProfileId:profile.id
      })});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`consultation ${r.status}`);
      saveAccess(d.consultation,d.accessToken);form.reset();status('상담요청이 등록되었습니다. 연락처는 암호화되어 상담대기열에 저장됩니다.');
    }catch(error){console.error('advisor consultation',error);status('상담요청 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.',true)}
    finally{btn.disabled=!profile;btn.textContent='상담 요청 등록'}
  }
  $('#advisorConsultForm')?.addEventListener('submit',submit);
  loadProfile();
})();
