// EKODI Education — open instructor notes with the EKODI account (any login path).
// Reads the central EKODI session on ekodi.kr, asks the Education Worker to verify the account
// as a registered instructor, then follows the server-chosen return location.
(function(){
  const button=document.getElementById('gateEkodi');
  const status=document.getElementById('gateEkodiStatus');
  if(!button)return;
  const say=text=>{if(status)status.textContent=text;};
  function sessionToken(){
    try{
      const raw=localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token');
      const data=raw?JSON.parse(raw):null;
      const session=data?.currentSession||data;
      const expires=Number(session?.expires_at||0)*1000;
      return session?.access_token&&(!expires||expires>Date.now()+30000)?session.access_token:'';
    }catch{return ''}
  }
  function signIn(){
    const target=new URL(button.dataset.auth||'https://ekodi.kr/auth/');
    target.searchParams.set('site','portal');
    target.searchParams.set('return_to',location.href);
    location.assign(target.toString());
  }
  button.addEventListener('click',async()=>{
    const token=sessionToken();
    if(!token){say('에코디 계정 로그인 화면으로 이동합니다.');signIn();return;}
    button.disabled=true;say('에코디 계정을 확인하고 있습니다.');
    try{
      const response=await fetch(location.pathname+location.search,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken:token})});
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.ok&&typeof data.location==='string'){location.assign(data.location);return;}
      say(data.message||'강사 확인에 실패했습니다. 다시 시도해 주세요.');
    }catch{say('강사 확인에 실패했습니다. 다시 시도해 주세요.');}
    button.disabled=false;
  });
})();
