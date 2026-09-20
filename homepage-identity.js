(()=>{
'use strict';
const root=document.documentElement;
function activeSession(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!/^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(key))continue;
      let parsed=null;
      try{parsed=JSON.parse(localStorage.getItem(key)||'null')}catch{}
      const session=parsed?.currentSession||parsed?.session||parsed;
      const token=String(session?.access_token||'');
      const user=session?.user;
      const exp=Number(session?.expires_at||0);
      if(token&&user?.id&&(!exp||exp*1000>Date.now()-60000))return session;
    }
  }catch{}
  return null;
}
function render(){
  const session=activeSession();
  const connected=Boolean(session);
  root.dataset.ekodiIdentity=connected?'connected':'guest';
  const action=document.querySelector('[data-ekodi-identity-action]');
  const label=document.querySelector('[data-ekodi-identity-label]');
  if(action){
    action.classList.toggle('is-connected',connected);
    if(connected){
      action.removeAttribute('href');
      action.setAttribute('aria-disabled','true');
      action.setAttribute('aria-label','EKODI ID 연결됨');
    }else{
      action.href='https://ekodi.kr/auth/?site=portal&return_to=https%3A%2F%2Fekodi.kr%2F';
      action.removeAttribute('aria-disabled');
      action.setAttribute('aria-label','EKODI ID로 로그인');
    }
  }
  if(label)label.textContent=connected?'ID 연결됨':'로그인';
  window.dispatchEvent(new CustomEvent('ekodi:root-identity-state',{detail:{connected}}));
}
render();
window.addEventListener('storage',event=>{if(/^sb-[a-z0-9]+-auth-token/i.test(String(event.key||'')))render()});
})();