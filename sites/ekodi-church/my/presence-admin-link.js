(()=>{
 'use strict';
 const link=document.getElementById('presenceAdminLink');if(!link)return;
 const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/presence-attendance-api?tenant=ekodi-church';
 let current=0;
 function accessToken(){
   try{
     const session=JSON.parse(localStorage.getItem('ekodi-church-member-session-v1')||'null');
     if(session?.accessToken && Number(session.expiresAt||0)>Math.floor(Date.now()/1000)+20)return session.accessToken;
     for(let i=0;i<localStorage.length;i++){
       const key=localStorage.key(i)||'';if(!/^sb-.*-auth-token$/.test(key))continue;
       const raw=JSON.parse(localStorage.getItem(key)||'null');const s=raw?.currentSession||raw?.session||raw;
       if(s?.access_token && Number(s.expires_at||0)>Math.floor(Date.now()/1000)+20)return s.access_token;
     }
   }catch{}
   return '';
 }
 async function verify(){
   const revision=++current;
   link.hidden=true;link.style.display='none';
   const token=accessToken();if(!token)return;
   try{
     const response=await fetch(API,{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(7000)});
     if(revision!==current || accessToken()!==token)return;
     if(response.ok){link.hidden=false;link.style.removeProperty('display');}
   }catch{link.hidden=true;link.style.display='none';}
 }
 window.addEventListener('storage',verify);
 window.addEventListener('pageshow',verify);
 window.addEventListener('focus',verify);
 window.addEventListener('ekodi:auth-logout',verify);
 void verify();
})();