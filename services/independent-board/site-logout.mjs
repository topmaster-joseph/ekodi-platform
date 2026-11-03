/**
 * Footer 로그아웃 button for SeonamMedi pages (owner request 2026-11-03).
 * Shown only while a stored EKODI/Supabase session exists. Logging out clears
 * that session from this browser and, where the page CSP allows it, revokes the
 * session on the auth server (scope=local: other devices stay signed in).
 * The same function is inlined in sites/seonammedi/public/app.js for the home
 * page, whose CSP (connect-src 'self') does not allow the revoke call.
 */
export function seonamSiteLogout(revoke){
  const KEY='sb-renzehysxirjilvdxacv-auth-token';
  const stores=()=>{const list=[];try{list.push(localStorage)}catch{}try{list.push(sessionStorage)}catch{}return list};
  const token=()=>{for(const st of stores())try{const d=JSON.parse(st.getItem(KEY)||'null'),s=d?.currentSession||d?.session||d;if(s?.access_token)return String(s.access_token)}catch{}return ''};
  const footer=document.querySelector('footer.site-footer');
  if(!footer||footer.querySelector('.site-logout')||!token())return;
  const button=document.createElement('button');button.type='button';button.className='site-logout';button.textContent='로그아웃';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    const current=token();
    if(revoke&&current){
      try{await fetch('https://renzehysxirjilvdxacv.supabase.co/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',authorization:'Bearer '+current},cache:'no-store',keepalive:true})}catch{}
    }
    for(const st of stores())try{st.removeItem(KEY)}catch{}
    // Drop sign-in intents so the page does not reopen a login flow after reload.
    const url=new URL(location.href);['compose','reply','auth_attempt','choose_account'].forEach(k=>url.searchParams.delete(k));
    // A hash-only difference would not reload the page, so reload explicitly then.
    if(url.search===location.search)location.reload();else location.replace(url.href);
  });
  footer.append(button);
}

// Isolated: a failure here must never interrupt the page script it is appended to.
export const SITE_LOGOUT_JS='try{('+seonamSiteLogout.toString()+')(true)}catch{}';
