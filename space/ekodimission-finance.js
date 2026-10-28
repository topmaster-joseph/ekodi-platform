(() => {
  'use strict';
  const URL_BASE='https://renzehysxirjilvdxacv.supabase.co';
  const PUBLIC_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const ENDPOINT=URL_BASE+'/functions/v1/ministry-member-finance-api';
  const OWN_SESSION='ekodimission-member-session-v1';
  const el=id=>document.getElementById(id);
  const nf=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
  let accessToken='';
  function normalized(raw){
    const v=raw?.currentSession||raw?.session||raw;
    return v?.accessToken||v?.access_token||v?.token||'';
  }
  function storedToken(){
    try{
      for(const key of [OWN_SESSION,'ekodi-auth-token']){
        const raw=localStorage.getItem(key)||sessionStorage.getItem(key);
        if(!raw)continue;
        try{const token=normalized(JSON.parse(raw));if(token)return token;}catch{if(raw.split('.').length===3)return raw;}
      }
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(!/^sb-.*-auth-token$/.test(key))continue;
        const token=normalized(JSON.parse(localStorage.getItem(key)||'null'));
        if(token)return token;
      }
    }catch{}
    return '';
  }
  async function tokenFromHandoff(){
    const hash=new URLSearchParams(location.hash.slice(1));
    const opaque=hash.get('ekodi_token');
    if(!opaque)return '';
    const response=await fetch(URL_BASE+'/auth/v1/verify',{
      method:'POST',headers:{apikey:PUBLIC_KEY,'content-type':'application/json'},
      body:JSON.stringify({token_hash:opaque,type:hash.get('ekodi_type')||'email'}),cache:'no-store'
    });
    if(!response.ok)throw new Error('로그인 연결에 실패했습니다.');
    const data=await response.json();const token=normalized(data);
    if(token){localStorage.setItem(OWN_SESSION,JSON.stringify(data));history.replaceState(null,'',location.pathname+location.search);}
    return token;
  }
  function state(message,error=false){
    el('financeState').textContent=message;
    el('financeState').dataset.error=String(error);
  }
  function loginLink(){
    return '/auth/?site=mission&direct=1&return_to='+encodeURIComponent(location.origin+location.pathname);
  }
  function years(){
    const year=new Date().getFullYear(),select=el('financeYear');
    for(let value=year;value>=year-5;value--){
      const item=document.createElement('option');item.value=String(value);item.textContent=value+'년';select.append(item);
    }
  }
  function render(rows){
    const host=el('financeRows');host.replaceChildren();
    if(!rows.length){state('선택한 항목에 승인·공개된 요약자료가 없습니다.');return;}
    for(const block of rows){
      const item=document.createElement('div');item.className='finance-row';
      const label=document.createElement('span'),amount=document.createElement('strong');
      label.textContent=block.label||'';amount.textContent=nf.format(Number(block.amount||0))+'원';
      item.append(label,amount);host.append(item);
    }
    state('승인된 공동체 재정 요약을 표시하고 있습니다.');
  }
  async function load(event){
    event?.preventDefault();
    const year=el('financeYear').value;
    const sections=[...document.querySelectorAll('input[name="section"]:checked')].map(e=>e.value);
    if(!accessToken){state('구글 로그인이 필요합니다.',true);return;}
    state('승인된 회계 자료를 확인하고 있습니다.');
    el('financeRows').replaceChildren();
    const query=new URLSearchParams({site:'ekodimission',year,sections:sections.join(',')});
    try{
      const response=await fetch(ENDPOINT+'?'+query,{
        headers:{authorization:'Bearer '+accessToken,apikey:PUBLIC_KEY},
        cache:'no-store'
      });
      const data=await response.json().catch(()=>({}));
      if(response.status===401){state('로그인이 만료되었습니다. 다시 로그인해 주세요.',true);el('financeLogin').hidden=false;return;}
      if(response.status===403){state('선교회 회원승인 또는 재정공개 권한을 확인해 주세요.',true);return;}
      if(!response.ok){state('재정공개 서비스 연결을 확인 중입니다.',true);return;}
      if(!data.ok){state(data.error==='not_published'?'해당 연도에 승인된 결산자료가 없습니다.':'조회 가능한 자료가 없습니다.');return;}
      el('financePeriod').textContent=(data.periodStart||'')+' ~ '+(data.periodEnd||'');
      render(Array.isArray(data.blocks)?data.blocks:[]);
    }catch{state('조회 연결이 원활하지 않습니다. 다시 시도해 주세요.',true);}
  }
  async function init(){
    el('financeLogin').href=loginLink();
    years();
    el('financeFilters').addEventListener('submit',load);
    try{accessToken=await tokenFromHandoff()||storedToken();}catch{accessToken='';}
    if(!accessToken){state('승인된 선교회 회원은 구글 계정으로 로그인해 주세요.');el('financeLogin').hidden=false;return;}
    el('financeApp').hidden=false;
    await load();
  }
  init();
})();