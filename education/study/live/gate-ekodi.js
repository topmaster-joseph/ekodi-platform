// EKODI Education — open instructor notes with the EKODI account (any login path).
// Signs in through the central EKODI login for the Education realm (site=edu, so it returns to this page),
// accepts the one-time #ekodi_token handoff on return, asks the Education Worker to verify the account
// as a registered instructor, then follows the server-chosen return location.
(function(){
  const button=document.getElementById('gateEkodi');
  const status=document.getElementById('gateEkodiStatus');
  if(!button)return;
  const say=text=>{if(status)status.textContent=text;};
  const SB=new URL(button.dataset.sb||'https://renzehysxirjilvdxacv.supabase.co').origin;
  const KEY=button.dataset.key||'';
  const STORE='sb-'+new URL(SB).hostname.split('.')[0]+'-auth-token';
  function sessionToken(){
    try{
      const raw=localStorage.getItem(STORE);
      const data=raw?JSON.parse(raw):null;
      const session=data?.currentSession||data;
      const expires=Number(session?.expires_at||0)*1000;
      return session?.access_token&&(!expires||expires>Date.now()+30000)?session.access_token:'';
    }catch{return ''}
  }
  // Central login returns here with #ekodi_token=…&ekodi_type=…: exchange it once for a session.
  async function acceptHandoff(){
    const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    const tokenHash=hash.get('ekodi_token');
    if(!tokenHash)return '';
    try{history.replaceState(null,'',location.pathname+location.search);}catch{}
    if(!KEY)return '';
    const response=await fetch(new URL('auth/v1/verify',SB).href,{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},
      body:JSON.stringify({type:hash.get('ekodi_type')||'email',token_hash:tokenHash})});
    const session=await response.json().catch(()=>null);
    if(!response.ok||!session?.access_token)return '';
    if(!session.expires_at&&session.expires_in)session.expires_at=Math.floor(Date.now()/1000)+Number(session.expires_in);
    try{localStorage.setItem(STORE,JSON.stringify(session));}catch{}
    return session.access_token;
  }
  function signIn(){
    const target=new URL(button.dataset.auth||'https://ekodi.kr/auth/');
    target.searchParams.set('site','edu');
    const back=new URL(location.href);back.hash='';
    target.searchParams.set('return_to',back.href);
    location.assign(target.toString());
  }
  async function unlock(token){
    button.disabled=true;say('에코디 계정을 확인하고 있습니다.');
    try{
      const response=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken:token})});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.ok&&typeof data.location==='string'){location.assign(data.location);return;}
      say(data.message||'강사 확인에 실패했습니다. 다시 시도해 주세요.');
    }catch{say('강사 확인에 실패했습니다. 다시 시도해 주세요.');}
    button.disabled=false;
  }
  button.addEventListener('click',()=>{
    const token=sessionToken();
    if(!token){say('에코디 계정 로그인 화면으로 이동합니다.');signIn();return;}
    unlock(token);
  });
  if(String(location.hash||'').includes('ekodi_token=')){
    say('로그인을 확인하고 있습니다.');
    acceptHandoff().then(token=>token?unlock(token):say('로그인 확인에 실패했습니다. 버튼을 다시 눌러 주세요.'))
      .catch(()=>say('로그인 확인에 실패했습니다. 버튼을 다시 눌러 주세요.'));
  }
})();
