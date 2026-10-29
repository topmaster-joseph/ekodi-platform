// Shared *read-only* Supabase OAuth session lookup for EKODI Invest public/member and My Invest.
// Match the canonical EKODI homepage-auth-state.js convention, not an ad-hoc localStorage key.
// Server endpoints still independently validate Bearer tokens; this never grants permissions.
export const INVEST_MEMBER_SESSION_BROWSER_SOURCE = String.raw\`
const EKODI_MEMBER_SESSION_KEY=/^sb-[a-z0-9]+-auth-token(?:\\.\\d+)?$/i;
function readEkodiMemberToken(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(!EKODI_MEMBER_SESSION_KEY.test(key))continue;
      let raw;
      try{raw=JSON.parse(localStorage.getItem(key)||'null')}catch{continue}
      const s=raw?.currentSession||raw?.session||raw;
      const expires=Number(s?.expires_at||0);
      if(!s?.user?.id||typeof s.access_token!=='string'||!s.access_token||s.access_token.length>8192)continue;
      if(!Number.isFinite(expires)||(expires>0&&expires*1000<=Date.now()))continue;
      return s.access_token;
    }
  }catch{}
  return '';
}
\`;
