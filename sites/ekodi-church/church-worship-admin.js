(()=>{
  'use strict';
  const link=document.querySelector('[data-church-worship-admin]');
  if(!link)return;
  const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api?scope=worship-access';
  // Public publishable key only. The server owns capability decisions.
  const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  let generation=0;

  function sessionToken(){
    try{
      const pastor=JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session')||'null');
      if(pastor?.accessToken && Number(pastor.expiresAt)>Math.floor(Date.now()/1000)+15)return pastor.accessToken;
      const shared=window.EKODI_MY_AUTH?.getAccessToken?.()||sessionStorage.getItem('ekodi-auth-token')||'';
      return typeof shared==='string'?shared:'';
    }catch{return ''}
  }

  async function verify(){
    const serial=++generation;
    link.hidden=true;
    const token=sessionToken();
    if(!token)return false;
    try{
      const response=await fetch(API,{
        method:'GET',
        headers:{apikey:PUBLISHABLE_KEY,authorization:'Bearer '+token,accept:'application/json'},
        cache:'no-store',
        signal:AbortSignal.timeout(8000)
      });
      const body=response.ok?await response.json().catch(()=>null):null;
      // Reject stale responses after session or role changes.
      if(serial!==generation||token!==sessionToken())return false;
      const allowed=response.ok&&body?.ok===true&&body?.permissions?.worship===true;
      link.hidden=!allowed;
      return allowed;
    }catch{
      if(serial===generation)link.hidden=true;
      return false;
    }
  }

  const refresh=()=>{verify().catch(()=>{link.hidden=true})};
  window.addEventListener('pageshow',refresh);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
  window.addEventListener('ekodi:auth-success',refresh);
  window.addEventListener('ekodi:auth-logout',refresh);
  refresh();
})();
