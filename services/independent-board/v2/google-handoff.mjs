import {SESSION_KEY,safeSession} from './citizen-controller.mjs';
const SUPABASE='https://renzehysxirjilvdxacv.supabase.co/auth/v1';
const KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
function save(storage,value){const data=JSON.stringify(value);try{storage.local.setItem(SESSION_KEY,data);return true}catch{}try{storage.session.setItem(SESSION_KEY,data);return true}catch{}return false}
function normalize(data,old){return {access_token:data.access_token,refresh_token:data.refresh_token||old?.refresh_token||'',expires_at:Number(data.expires_at)||Math.floor(Date.now()/1000)+Number(data.expires_in||3600),user:data.user||old?.user||null}}
export async function exchangeGoogleReturn({href,fetcher=fetch,storage,replace}){
  const url=new URL(href),params=new URLSearchParams(url.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return false;
  const type=params.get('ekodi_type')||'email';
  if(!['email','magiclink','recovery'].includes(type))throw Error('invalid_auth_type');
  const response=await fetcher(SUPABASE+'/verify',{method:'POST',headers:{'content-type':'application/json',apikey:KEY},body:JSON.stringify({token_hash:token,type}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw Error('auth_exchange_failed');
  if(!save(storage,normalize(data)))throw Error('session_storage_blocked');
  replace?.(url.pathname+url.search);
  return true;
}
export async function refreshGoogleSession({fetcher=fetch,storage}){
  let old=null;
  for(const target of [storage.local,storage.session])try{old=JSON.parse(target.getItem(SESSION_KEY)||'null');if(old)break}catch{}
  old=old?.currentSession||old?.session||old;
  if(!old?.refresh_token)return false;
  const response=await fetcher(SUPABASE+'/token?grant_type=refresh_token',{method:'POST',headers:{'content-type':'application/json',apikey:KEY},body:JSON.stringify({refresh_token:old.refresh_token}),cache:'no-store'});
  const data=await response.json().catch(()=>null);
  return Boolean(response.ok&&data?.access_token&&save(storage,normalize(data,old)));
}
