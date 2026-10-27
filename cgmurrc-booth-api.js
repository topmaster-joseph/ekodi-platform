// 청계면 도시재생 주민협의체(cgmurrc) 축제 부스 근무 분담 API — 회원별 개인 링크.
//
// Routes (Control API, same origin as ekodi.kr pages):
//   GET  /api/cgmurrc/booth/board   public read-only board: confirmed names with their 연번, per slot
//   GET  /api/cgmurrc/booth/me      member, authenticated by personal link key (header x-cgmurrc-booth-key)
//   POST /api/cgmurrc/booth/me      member asks to add a slot / drop an assigned slot / withdraw the ask
//   GET  /api/cgmurrc/booth/admin   cgmurrc administrators only
//   POST /api/cgmurrc/booth/admin   assign, unassign, confirm, reject, add member, issue personal link
//
// Invariants:
// - A member is identified ONLY by the SHA-256 of the key in the request. The member API accepts no
//   member id, so one member's key can never read-modify another member's row.
// - Plain keys are never stored. Issuing a link rotates the key; the previous link stops working.
// - Members only express wishes (requested / drop_requested). Only an administrator confirms.
// - Administrator authority is resolved server-side by EKODI tenant authority for tenant `cgmurrc`.
// - The only personal data is the member's name. Logs never contain keys or names.
import { resolveTenantAccessAuthority } from './tenant-access-authority.js';

export const BOOTH_API_PREFIX='/api/cgmurrc/booth';
export const BOOTH_TENANT='cgmurrc';
export const BOOTH_EVENT='ramen-2026-10-28';
export const BOOTH_LINK_BASE='https://ekodi.kr/cgmurrc/booth/#k=';
// Members may change wishes until the booth closes; links keep showing the schedule a few days longer.
export const MEMBER_WRITES_CLOSE_AT=Date.parse('2026-10-28T18:00:00+09:00');
export const LINKS_VALID_UNTIL=Date.parse('2026-11-01T00:00:00+09:00');
export const SLOTS=Object.freeze([
  {label:'10:00~11:00',tag:'준비'},{label:'11:00~12:00'},{label:'12:00~13:00'},{label:'13:00~14:00'},
  {label:'14:00~15:00'},{label:'15:00~16:00'},{label:'16:00~17:00'},{label:'17:00~18:00',tag:'마감'},
]);
const MAX_MEMBERS=60, MAX_BODY=2048, MAX_ADMIN_BODY=16384;
const enc=new TextEncoder();

function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-ekodi-route':'cgmurrc-booth',
    ...extra,
  }});
}
const fail=(code,message,status=400,extra)=>json({ok:false,code,error:message},status,extra);
const nowIso=now=>new Date(now).toISOString();
const isSlot=value=>Number.isInteger(value)&&value>=0&&value<SLOTS.length;

export function newBoothKey(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  let s='';for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export async function hashBoothKey(key){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(String(key))));
  return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const validKeyShape=key=>typeof key==='string'&&/^[A-Za-z0-9_-]{40,64}$/.test(key);

async function readJson(request,max=MAX_BODY){
  const length=Number(request.headers.get('content-length')||0);
  if(length>max)return {tooLarge:true};
  const raw=await request.text();
  if(raw.length>max)return {tooLarge:true};
  try{return {value:JSON.parse(raw)}}catch{return {value:null}}
}
function sameOriginWrite(request){
  const origin=request.headers.get('origin');
  if(origin&&origin!=='https://ekodi.kr')return false;
  const site=request.headers.get('sec-fetch-site');
  if(site&&!['same-origin','none'].includes(site))return false;
  return request.headers.get('x-ekodi-intake-request')==='1';
}
async function audit(env,actor,action,memberId,slot,now){
  await env.DB.prepare('INSERT INTO cgmurrc_booth_audit (id,event,actor,action,member_id,slot,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),BOOTH_EVENT,actor,action,memberId??null,Number.isInteger(slot)?slot:null,nowIso(now)).run();
}
async function members(env){
  const r=await env.DB.prepare('SELECT id,name,sort_order,token_issued_at FROM cgmurrc_booth_members WHERE event=? AND active=1 ORDER BY sort_order,created_at')
    .bind(BOOTH_EVENT).all();
  return r?.results||[];
}
async function entries(env){
  const r=await env.DB.prepare(`SELECT e.member_id,e.slot,e.status,e.updated_by,e.updated_at FROM cgmurrc_booth_entries e
      JOIN cgmurrc_booth_members m ON m.id=e.member_id AND m.active=1
    WHERE e.event=? ORDER BY e.slot`).bind(BOOTH_EVENT).all();
  return r?.results||[];
}
async function entryOf(env,memberId,slot){
  return env.DB.prepare('SELECT status FROM cgmurrc_booth_entries WHERE event=? AND member_id=? AND slot=?')
    .bind(BOOTH_EVENT,memberId,slot).first();
}
async function putEntry(env,memberId,slot,status,by,now){
  await env.DB.prepare(`INSERT INTO cgmurrc_booth_entries (event,member_id,slot,status,updated_by,updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(event,member_id,slot) DO UPDATE SET status=excluded.status,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(BOOTH_EVENT,memberId,slot,status,by,nowIso(now)).run();
}
async function deleteEntry(env,memberId,slot){
  await env.DB.prepare('DELETE FROM cgmurrc_booth_entries WHERE event=? AND member_id=? AND slot=?').bind(BOOTH_EVENT,memberId,slot).run();
}
// The shared board shows who is confirmed in each slot (names only), for 교대·인수인계.
function board(rows,list){
  const names=new Map(list.map(m=>[m.id,m.name]));
  const out=SLOTS.map(()=>[]);
  for(const e of rows)if(e.status!=='requested'&&names.has(e.member_id))out[e.slot].push(names.get(e.member_id));
  return out;
}
// 연번 = position in the member list (the order the secretary registered names), stable for the event.
function numbering(list){return new Map(list.map((m,i)=>[m.id,i+1]))}
function numberedBoard(rows,list){
  const names=new Map(list.map(m=>[m.id,m.name])),no=numbering(list);
  const out=SLOTS.map(()=>[]);
  for(const e of rows)if(e.status!=='requested'&&names.has(e.member_id))out[e.slot].push({no:no.get(e.member_id),name:names.get(e.member_id)});
  for(const slot of out)slot.sort((a,b)=>a.no-b.no);
  return out;
}
async function publicBoard(env){
  const [list,rows]=await Promise.all([members(env),entries(env)]);
  // Names and 연번 only: no ids, no wishes, no link state.
  return json({ok:true,event:BOOTH_EVENT,slots:SLOTS,board:numberedBoard(rows,list),member_count:list.length});
}

// ---------- member ----------
async function memberFromKey(request,env,now){
  if(now>=LINKS_VALID_UNTIL)return {error:fail('LINK_EXPIRED','행사가 끝나 개인 링크가 만료되었습니다.',410)};
  const key=request.headers.get('x-cgmurrc-booth-key');
  if(!validKeyShape(key))return {error:fail('LINK_INVALID','개인 링크가 올바르지 않습니다. 사무국에서 받은 링크를 다시 눌러 주세요.',401)};
  const member=await env.DB.prepare('SELECT id,name FROM cgmurrc_booth_members WHERE token_hash=? AND event=? AND active=1')
    .bind(await hashBoothKey(key),BOOTH_EVENT).first();
  if(!member)return {error:fail('LINK_INVALID','개인 링크가 올바르지 않거나 새 링크로 바뀌었습니다. 사무국에 문의해 주세요.',401)};
  return {member};
}
async function memberView(env,member,now){
  const [list,rows]=await Promise.all([members(env),entries(env)]);
  const mine={};for(const e of rows)if(e.member_id===member.id)mine[e.slot]=e.status;
  return json({ok:true,event:BOOTH_EVENT,member:{name:member.name,no:numbering(list).get(member.id)??null},slots:SLOTS,mine,
    board:board(rows,list),board_numbered:numberedBoard(rows,list),
    writable:now<MEMBER_WRITES_CLOSE_AT,writes_close_at:nowIso(MEMBER_WRITES_CLOSE_AT)});
}
// Allowed member transitions. Anything else is refused; confirmation belongs to the administrator.
const MEMBER_ACTIONS=Object.freeze({
  request:{from:null,to:'requested'},       // 희망 시간 추가
  withdraw:{from:'requested',to:null},       // 희망 취소
  drop:{from:'assigned',to:'drop_requested'},// 배정된 시간 빠지기 요청
  keep:{from:'drop_requested',to:'assigned'},// 빠지기 요청 취소
});
async function memberWrite(request,env,member,now){
  if(!sameOriginWrite(request))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청입니다.',403);
  if(now>=MEMBER_WRITES_CLOSE_AT)return fail('WRITES_CLOSED','행사가 끝나 더 이상 바꿀 수 없습니다.',409);
  const {value,tooLarge}=await readJson(request);
  if(tooLarge)return fail('BODY_TOO_LARGE','요청이 너무 큽니다.',413);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['slot','action'].includes(k)))
    return fail('INVALID_BODY','요청 형식이 올바르지 않습니다.');
  const rule=MEMBER_ACTIONS[value.action];
  if(!rule||!isSlot(value.slot))return fail('INVALID_BODY','요청 형식이 올바르지 않습니다.');
  const current=(await entryOf(env,member.id,value.slot))?.status??null;
  if(current!==rule.from)return fail('STATE_CHANGED','이미 바뀐 시간입니다. 화면을 새로 고쳐 주세요.',409);
  if(rule.to)await putEntry(env,member.id,value.slot,rule.to,'member',now);
  else await deleteEntry(env,member.id,value.slot);
  await audit(env,'member',`member.${value.action}`,member.id,value.slot,now);
  return memberView(env,member,now);
}

// ---------- administrator ----------
async function adminAuthority(request,env,resolveAuthority){
  const authority=await resolveAuthority(request,env,{tenantSlug:BOOTH_TENANT});
  if(!authority?.ok){
    const status=authority?.status===401?401:403;
    return {error:fail(status===401?'ADMIN_LOGIN_REQUIRED':'ADMIN_FORBIDDEN',
      status===401?'주민협의체 관리자 로그인이 필요합니다.':'주민협의체 관리자 권한이 없습니다.',status)};
  }
  if(!['platform','tenant','tenant-delegated'].includes(authority.scope))return {error:fail('ADMIN_FORBIDDEN','주민협의체 관리자 권한이 없습니다.',403)};
  return {authority};
}
async function adminView(env,authority,extra={}){
  const [list,rows]=await Promise.all([members(env),entries(env)]);
  return json({ok:true,event:BOOTH_EVENT,slots:SLOTS,
    members:list.map((m,i)=>({id:m.id,no:i+1,name:m.name,link_issued:Boolean(m.token_issued_at)})),
    entries:rows.map(e=>({member_id:e.member_id,slot:e.slot,status:e.status,updated_by:e.updated_by})),
    viewer:{email:authority.email,scope:authority.scope},...extra});
}
async function memberById(env,id){
  if(typeof id!=='string'||id.length>64)return null;
  return env.DB.prepare('SELECT id,name FROM cgmurrc_booth_members WHERE id=? AND event=? AND active=1').bind(id,BOOTH_EVENT).first();
}
const ADMIN_KEYS=new Set(['action','member_id','slot','name','decision','items']);
const MAX_BULK=100;
async function adminWrite(request,env,authority,now){
  if(!sameOriginWrite(request))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청입니다.',403);
  const {value,tooLarge}=await readJson(request,MAX_ADMIN_BODY);
  if(tooLarge)return fail('BODY_TOO_LARGE','요청이 너무 큽니다.',413);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!ADMIN_KEYS.has(k)))
    return fail('INVALID_BODY','요청 형식이 올바르지 않습니다.');
  const actor='admin:'+String(authority.email||'').toLowerCase();
  const {action}=value;

  if(action==='add_member'){
    const name=typeof value.name==='string'?value.name.trim():'';
    if(!name||name.length>20||/[<>\n\r]/.test(name))return fail('INVALID_NAME','이름은 1~20자로 입력해 주세요.');
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM cgmurrc_booth_members WHERE event=? AND active=1').bind(BOOTH_EVENT).first();
    if(Number(count?.n||0)>=MAX_MEMBERS)return fail('TOO_MANY_MEMBERS','회원은 최대 60명까지 등록할 수 있습니다.',409);
    const dup=await env.DB.prepare('SELECT id FROM cgmurrc_booth_members WHERE event=? AND active=1 AND name=?').bind(BOOTH_EVENT,name).first();
    if(dup)return fail('DUPLICATE_NAME','이미 등록된 이름입니다.',409);
    const id=crypto.randomUUID();
    const max=await env.DB.prepare('SELECT COALESCE(MAX(sort_order),0) AS m FROM cgmurrc_booth_members WHERE event=?').bind(BOOTH_EVENT).first();
    await env.DB.prepare('INSERT INTO cgmurrc_booth_members (id,event,name,sort_order,active,created_at,updated_at) VALUES (?,?,?,?,1,?,?)')
      .bind(id,BOOTH_EVENT,name,Number(max?.m||0)+1,nowIso(now),nowIso(now)).run();
    await audit(env,actor,'admin.add_member',id,null,now);
    return adminView(env,authority);
  }

  if(action==='bulk'){
    // 선택한 회원 요청(희망·빠지기)을 한 번에 확정 또는 거절. 그사이 바뀐 항목은 건너뛴다.
    const decision=value.decision;
    const items=Array.isArray(value.items)?value.items:null;
    if(!['confirm','reject'].includes(decision)||!items||!items.length||items.length>MAX_BULK)return fail('INVALID_BODY','요청 형식이 올바르지 않습니다.');
    if(items.some(it=>!it||typeof it!=='object'||Array.isArray(it)||Object.keys(it).some(k=>!['member_id','slot'].includes(k))||typeof it.member_id!=='string'||!isSlot(it.slot)))
      return fail('INVALID_BODY','요청 형식이 올바르지 않습니다.');
    let done=0,skipped=0;const seen=new Set();
    for(const it of items){
      const k=it.member_id+':'+it.slot;if(seen.has(k)){skipped++;continue}seen.add(k);
      if(!await memberById(env,it.member_id)){skipped++;continue}
      const current=(await entryOf(env,it.member_id,it.slot))?.status??null;
      if(current==='requested')decision==='confirm'?await putEntry(env,it.member_id,it.slot,'assigned','admin',now):await deleteEntry(env,it.member_id,it.slot);
      else if(current==='drop_requested')decision==='confirm'?await deleteEntry(env,it.member_id,it.slot):await putEntry(env,it.member_id,it.slot,'assigned','admin',now);
      else{skipped++;continue}
      await audit(env,actor,'admin.bulk_'+decision,it.member_id,it.slot,now);done++;
    }
    return adminView(env,authority,{bulk:{decision,done,skipped}});
  }

  const member=await memberById(env,value.member_id);
  if(!member)return fail('MEMBER_NOT_FOUND','회원을 찾을 수 없습니다.',404);

  if(action==='issue_link'){
    const key=newBoothKey();
    await env.DB.prepare('UPDATE cgmurrc_booth_members SET token_hash=?,token_issued_at=?,updated_at=? WHERE id=?')
      .bind(await hashBoothKey(key),nowIso(now),nowIso(now),member.id).run();
    await audit(env,actor,'admin.issue_link',member.id,null,now);
    // The plain link is returned exactly once; only its hash is stored.
    return adminView(env,authority,{issued:{member_id:member.id,name:member.name,link:BOOTH_LINK_BASE+key}});
  }
  if(action==='remove_member'){
    await env.DB.prepare('UPDATE cgmurrc_booth_members SET active=0,token_hash=NULL,updated_at=? WHERE id=?').bind(nowIso(now),member.id).run();
    await audit(env,actor,'admin.remove_member',member.id,null,now);
    return adminView(env,authority);
  }

  if(!isSlot(value.slot))return fail('INVALID_SLOT','시간대가 올바르지 않습니다.');
  const current=(await entryOf(env,member.id,value.slot))?.status??null;
  const by='admin';
  if(action==='assign'){await putEntry(env,member.id,value.slot,'assigned',by,now)}
  else if(action==='unassign'){if(current)await deleteEntry(env,member.id,value.slot)}
  else if(action==='confirm'){
    if(current==='requested')await putEntry(env,member.id,value.slot,'assigned',by,now);
    else if(current==='drop_requested')await deleteEntry(env,member.id,value.slot);
    else return fail('STATE_CHANGED','확정할 요청이 없습니다. 화면을 새로 고쳐 주세요.',409);
  }else if(action==='reject'){
    if(current==='requested')await deleteEntry(env,member.id,value.slot);
    else if(current==='drop_requested')await putEntry(env,member.id,value.slot,'assigned',by,now);
    else return fail('STATE_CHANGED','거절할 요청이 없습니다. 화면을 새로 고쳐 주세요.',409);
  }else return fail('INVALID_ACTION','지원하지 않는 작업입니다.');
  await audit(env,actor,'admin.'+action,member.id,value.slot,now);
  return adminView(env,authority);
}

// ---------- entry ----------
export function isBoothApiPath(pathname){return pathname===BOOTH_API_PREFIX||pathname.startsWith(BOOTH_API_PREFIX+'/')}
export async function handleCgmurrcBooth(request,env,options={}){
  const url=new URL(request.url);
  if(!isBoothApiPath(url.pathname))return null;
  const sub=url.pathname.slice(BOOTH_API_PREFIX.length).replace(/\/$/,'');
  if(sub!=='/me'&&sub!=='/admin'&&sub!=='/board')return fail('NOT_FOUND','찾을 수 없습니다.',404);
  if(!env?.DB)return fail('STORAGE_UNAVAILABLE','저장소를 사용할 수 없습니다.',503);
  if(!['GET','POST'].includes(request.method))return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405,{allow:'GET, POST'});
  const now=typeof options.now==='function'?options.now():Date.now();
  try{
    if(sub==='/board'){
      if(request.method!=='GET')return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405,{allow:'GET'});
      return await publicBoard(env);
    }
    if(sub==='/me'){
      const {member,error}=await memberFromKey(request,env,now);
      if(error)return error;
      return request.method==='GET'?await memberView(env,member,now):await memberWrite(request,env,member,now);
    }
    const {authority,error}=await adminAuthority(request,env,options.resolveAuthority||resolveTenantAccessAuthority);
    if(error)return error;
    return request.method==='GET'?await adminView(env,authority):await adminWrite(request,env,authority,now);
  }catch(error){
    console.error('[cgmurrc-booth] operation failed',error?.name||'Error');
    return fail('UNAVAILABLE','일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  }
}
