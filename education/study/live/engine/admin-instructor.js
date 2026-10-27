// EKODI super administrators can always open the instructor surfaces: the central admin token kept in this
// tab (sessionStorage, from https://ekodi.kr/auth/?site=admin) is exchanged once for the HttpOnly instructor
// cookie. The server re-checks the token against the central session API and accepts role super_admin only.
import {readToken,clearToken,acceptAdminHandoff,adminLoginUrl} from './factchat-demo.js';
import {livePath,SLASH} from './model.js';

export {acceptAdminHandoff,adminLoginUrl,readToken};
export async function adminInstructorSession(win,{fetchImpl=win.fetch.bind(win)}={}){
  const token=readToken(win);
  if(!token)return {ok:false,code:'no_admin_token'};
  let res,data={};
  try{
    res=await fetchImpl(livePath(win.location.pathname,'unlock'+SLASH+'admin'),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{authorization:'Bearer '+token}});
    data=await res.json().catch(()=>({}));
  }catch{return {ok:false,code:'network',message:'네트워크 오류로 관리자 확인을 하지 못했습니다.'};}
  if(res.ok&&data.ok)return {ok:true};
  if(res.status===401)clearToken(win);
  return {ok:false,code:data.code||'failed',message:data.message||'관리자 확인에 실패했습니다.'};
}

// Reload once to enter with the new cookie; never loop if the browser refused it.
const RELOAD_KEY='ekodi-admin-unlock-at';
export function reloadOnce(win){
  let last=0;try{last=Number(win.sessionStorage.getItem(RELOAD_KEY))||0;}catch{}
  if(Date.now()-last<30000)return false;
  try{win.sessionStorage.setItem(RELOAD_KEY,String(Date.now()));}catch{}
  win.location.reload();return true;
}
