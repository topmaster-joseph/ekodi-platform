// Motor festival application persistence: inject a server-side D1 database and verified admin identity.
// This module intentionally does not authenticate users from request headers or client claims.
const memberships = new Set(['regular','join','info','none']);
const intents = new Set(['yes','maybe','no']);
const categories = new Set(['음식·분식','커피·음료·디저트','농특산물·가공식품','생활용품·잡화','공예·체험·서비스','기타']);
const supports = new Set(['테이블','의자','전기','급수','홍보공간']);
const activities = new Set(['판매','음식·음료','체험','홍보','시식·시연']);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const valid=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const opt=(v,max)=>v===undefined||(typeof v==='string'&&v.length<=max);
const subset=(v,allowed)=>v===undefined||(Array.isArray(v)&&v.length<=allowed.size&&v.every(x=>allowed.has(x)));
export const MOTOR_FESTIVAL_SCHEMA = `CREATE TABLE IF NOT EXISTS motor_festival_2026_applications (
 id TEXT PRIMARY KEY, created_at TEXT NOT NULL, business_name TEXT NOT NULL,
 contact_name TEXT NOT NULL, phone TEXT NOT NULL, category TEXT NOT NULL,
 membership TEXT NOT NULL, intent TEXT NOT NULL, activity TEXT NOT NULL,
 items TEXT NOT NULL, hours TEXT NOT NULL, support TEXT NOT NULL,
 staff TEXT NOT NULL, notes TEXT NOT NULL, expires_at TEXT NOT NULL
);`;
export async function motorFestivalApi(request,{db,isMerchantAdmin=false,rateLimit}={}){
 const path=new URL(request.url).pathname;
 if(path!=='/api/merchant-events/motor-festival-2026/applications')return null;
 if(!db)return json({error:'storage_unavailable'},503);
 if(request.method==='GET'){
  if(!isMerchantAdmin)return json({error:'forbidden'},403);
  const result=await db.prepare('SELECT * FROM motor_festival_2026_applications WHERE expires_at > ? ORDER BY created_at DESC LIMIT 1000').bind(new Date().toISOString()).all();
  const applications=(result.results||[]).map(a=>({...a,activity:JSON.parse(a.activity),support:JSON.parse(a.support)}));
  return json({summary:{total:applications.length,regular:applications.filter(a=>a.membership==='regular').length,join:applications.filter(a=>a.membership==='join').length,participating:applications.filter(a=>a.intent==='yes').length},applications});
 }
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(typeof rateLimit!=='function')return json({error:'rate_limit_unavailable'},503);
 if(!(await rateLimit(request)))return json({error:'too_many_requests'},429);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'invalid_content_type'},415);
 if(Number(request.headers.get('content-length')||0)>8192)return json({error:'too_large'},413);
 let a;try{const raw=await request.text();if(raw.length>8192)return json({error:'too_large'},413);a=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
 if(!a||!valid(a.business_name,100)||!valid(a.contact_name,60)||!valid(a.phone,20)||!(/^[0-9+() -]{9,20}$/.test(a.phone))||!categories.has(a.category)||!memberships.has(a.membership)||!intents.has(a.intent)||!subset(a.activity,activities)||!subset(a.support,supports)||!opt(a.items,300)||!opt(a.notes,1000)||!['all','am','pm','discuss'].includes(a.hours)||!['1','2','3+'].includes(a.staff)||a.consent!=='on')return json({error:'invalid_application'},400);
 const id=crypto.randomUUID(),now=new Date(),expires=new Date('2026-11-24T14:59:59Z');
 if(now>=expires)return json({error:'registration_closed'},410);
 try{await db.prepare('INSERT INTO motor_festival_2026_applications (id,created_at,business_name,contact_name,phone,category,membership,intent,activity,items,hours,support,staff,notes,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,now.toISOString(),a.business_name.trim(),a.contact_name.trim(),a.phone.trim(),a.category,a.membership,a.intent,JSON.stringify(a.activity||[]),a.items||'',a.hours,JSON.stringify(a.support||[]),a.staff,a.notes||'',expires.toISOString()).run();return json({receipt_id:id},201)}catch{return json({error:'storage_failure'},503)}
}
