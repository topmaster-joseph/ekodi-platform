// QR screen sharing: only verified EKODI instructors create a room.
// Invites grant learner access only. Room signaling is scoped to one object.
import {ekodiInstructor} from './education-instructor-gate.js';
const BASE='/study/live/screen-share/api/';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const object=(env,id)=>env.EDU_SCREEN_ROOMS.get(env.EDU_SCREEN_ROOMS.idFromName('edu-screen:'+id));
export async function educationScreenApi(request,env,{url=new URL(request.url)}={}){
 if(!url.pathname.startsWith(BASE))return null;
 if(env.EDU_SCREEN_SHARE_ENABLED!=='true'||!env.EDU_SCREEN_ROOMS)return response({ok:false,code:'not_enabled'},503);
 if(request.headers.get('origin')!=='https://ekodi.kr')return response({ok:false,code:'origin_forbidden'},403);
 if(url.pathname===BASE+'rooms'&&request.method==='POST'){
  const token=(request.headers.get('authorization')||'').match(/^Bearer ([^\s]{15,8192})$/i)?.[1];
  if(!token||!await ekodiInstructor(token,env))return response({ok:false,code:'instructor_login_required'},401);
  const id=crypto.randomUUID().replaceAll('-',''),hostKey=secret(),joinKey=secret();
  const initialized=await object(env,id).fetch(new Request('https://room/init',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({id,hostKey,joinKey,createdAt:Date.now()})
  }));
  if(!initialized.ok)return response({ok:false,code:'room_create_failed'},503);
  const {expiresAt}=await initialized.json();
  return response({ok:true,id,hostKey,joinKey,expiresAt,
   joinUrl:'https://ekodi.kr/edu/study/live/screen-share/?r='+id+'&k='+joinKey});
 }
 const m=new RegExp('^'+BASE+'rooms/([a-f0-9]{32})/(join|ws)$').exec(url.pathname);
 if(!m)return response({ok:false,code:'not_found'},404);
 if(m[2]==='join'&&request.method==='POST'){
  const raw=await request.text();
  if(raw.length>4096)return response({ok:false,code:'too_large'},413);
  return object(env,m[1]).fetch(new Request('https://room/join',{
   method:'POST',headers:{'content-type':'application/json'},body:raw}));
 }
 if(m[2]==='ws'&&request.method==='GET'&&request.headers.get('upgrade')?.toLowerCase()==='websocket')
  return object(env,m[1]).fetch(new Request('https://room/connect',request));
 return response({ok:false,code:'method_not_allowed'},405);
}
