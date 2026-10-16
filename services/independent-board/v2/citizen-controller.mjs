/**
 * Citizen Voices V2: isolated browser controller. Does not mutate legacy DOM.
 * Existing Independent Board D1/API remains canonical until verified cutover.
 */
export const SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
export const API_BASE='/board/api';
export function mounted(base,pathname){
  return pathname.startsWith('/seonammedi/board')?'/seonammedi'+base:base;
}
export function safeSession(raw,now=Math.floor(Date.now()/1000)){
  try{
    const data=typeof raw==='string'?JSON.parse(raw):raw;
    const s=data?.currentSession||data?.session||data;
    if(!s||typeof s.access_token!=='string'||!s.access_token||Number(s.expires_at||0)<=now+30)return null;
    return {access_token:s.access_token,expires_at:Number(s.expires_at),refresh_token:s.refresh_token||''};
  }catch{return null}
}
export function composeReturn(locationHref){
  const target=new URL(locationHref);
  if(!['https:'].includes(target.protocol))throw Error('invalid_return');
  target.hash='';
  target.searchParams.set('compose','1');
  target.searchParams.delete('choose_account');
  target.searchParams.delete('manage');
  return target.href;
}
export function authUrl(locationHref){
  const target=new URL(composeReturn(locationHref));
  if(!(target.hostname==='seonammedi.kr'||target.hostname==='www.seonammedi.kr'||(target.hostname==='ekodi.kr'&&target.pathname.startsWith('/seonammedi/board/'))))throw Error('untrusted_return');
  const url=new URL('https://ekodi.kr/auth/');
  url.searchParams.set('site','seonammedi');
  url.searchParams.set('direct','1');
  url.searchParams.set('purpose','seonammedi-board-write');
  url.searchParams.set('return_to',target.href);
  url.searchParams.set('select_account','1');
  return url.href;
}
export function consumeComposeIntent(href){
  const target=new URL(href);
  const wanted=target.searchParams.get('compose')==='1';
  target.searchParams.delete('compose');
  target.searchParams.delete('choose_account');
  return {wanted,clean:target.pathname+target.search+target.hash};
}
export async function createVoiceController({href,storage,fetcher=fetch,now,exchange,refresh}){
  const current=new URL(href);
  const endpoint=path=>mounted(API_BASE+path,current.pathname);
  const session=()=>safeSession(storage.getItem(SESSION_KEY),now?.());
  async function verified(){
    let s=session();
    if(!s&&refresh){await refresh();s=session()}
    if(!s)return null;
    const r=await fetcher(endpoint('/auth/session'),{headers:{authorization:'Bearer '+s.access_token},cache:'no-store'});
    if(r.status===401&&refresh){await refresh();const fresh=session();if(fresh&&fresh.access_token!==s.access_token)return verified()}
    if(!r.ok)return null;
    const data=await r.json();
    return data?.ok===true&&data?.authenticated===true&&data?.provider==='google'?s:null;
  }
  async function initialize(){
    if(exchange)await exchange();
    const identity=await verified();
    return {authenticated:!!identity,openComposer:!!identity&&current.searchParams.get('compose')==='1',requiresLogin:!identity&&current.searchParams.get('compose')==='1',loginUrl:!identity?authUrl(href):null};
  }
  async function list(query=''){
    const url=endpoint('/posts')+(query?'?q='+encodeURIComponent(query):'');
    const r=await fetcher(url,{cache:'no-store'});
    if(!r.ok)throw Error('list_unavailable');
    const data=await r.json();
    return Array.isArray(data.items)?data.items:[];
  }
  async function write(message,extras={}){
    const identity=await verified();
    if(!identity)return {ok:false,loginUrl:authUrl(href)};
    const body={message:String(message||'').trim().slice(0,12000),category:'other',...extras};
    if(!body.message)throw Error('empty_message');
    const r=await fetcher(endpoint('/posts'),{method:'POST',headers:{authorization:'Bearer '+identity.access_token,'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
    const data=await r.json().catch(()=>({}));
    if(!r.ok||data.ok===false)throw Error(data.error||'write_failed');
    return {ok:true,...data};
  }
  return {initialize,verified,list,write};
}
