const API_PATH='/api/seonam-medi/voices';
const CATEGORIES=new Set(['question','proposal','experience','factcheck','tip','other']);
const clean=(value,max)=>String(value??'').trim().slice(0,max);
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
async function fingerprint(request){
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  const bytes=new TextEncoder().encode(ip);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function ensureSchema(db){
  await db.exec(`CREATE TABLE IF NOT EXISTS seonam_med_civic_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    public_consent INTEGER NOT NULL DEFAULT 0,
    privacy_consent INTEGER NOT NULL DEFAULT 1,
    review_status TEXT NOT NULL DEFAULT 'received',
    request_fingerprint TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_created ON seonam_med_civic_voices(created_at);
  CREATE INDEX IF NOT EXISTS idx_seonam_med_civic_voices_review ON seonam_med_civic_voices(review_status,created_at);`);
}
export async function handleSeonamMediCivicApi(request,env){
  const url=new URL(request.url);
  if(url.pathname!==API_PATH)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{allow:'POST, OPTIONS','cache-control':'no-store'}});
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  if(env?.ENVIRONMENT==='production'&&request.headers.get('origin')!=='https://ekodi.kr')return json({ok:false,error:'origin_not_allowed'},403);
  if(!env?.DB?.prepare)return json({ok:false,error:'storage_unavailable',message:'의견 접수 저장소를 사용할 수 없습니다.'},503);
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>16384)return json({ok:false,error:'payload_too_large'},413);
  let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
  if(clean(body?.website,200))return json({ok:true,message:'의견이 접수되었습니다.'});
  const category=clean(body?.category||'other',24).toLowerCase();
  const displayName=clean(body?.name,80);
  const contact=clean(body?.contact,160);
  const message=clean(body?.message,3000);
  const publicConsent=body?.publicConsent===true?1:0;
  if(!CATEGORIES.has(category))return json({ok:false,error:'invalid_category',message:'의견 유형을 확인해 주세요.'},400);
  if(!message)return json({ok:false,error:'invalid_message',message:'의견 내용을 입력해 주세요.'},400);
  if(body?.privacyConsent!==true)return json({ok:false,error:'privacy_consent_required',message:'개인정보 처리 동의가 필요합니다.'},400);
  await ensureSchema(env.DB);
  const requestFingerprint=await fingerprint(request);
  const recent=await env.DB.prepare(`SELECT count(*) AS count FROM seonam_med_civic_voices WHERE request_fingerprint=? AND unixepoch(created_at)>=unixepoch('now')-3600`).bind(requestFingerprint).first();
  if(Number(recent?.count||0)>=8)return json({ok:false,error:'rate_limited',message:'잠시 후 다시 접수해 주세요.'},429);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`INSERT INTO seonam_med_civic_voices
    (category,display_name,contact,message,public_consent,privacy_consent,review_status,request_fingerprint,created_at,updated_at)
    VALUES (?,?,?,?,?,1,'received',?,?,?)`)
    .bind(category,displayName,contact,message,publicConsent,requestFingerprint,now,now).run();
  return json({ok:true,submissionId:result?.meta?.last_row_id||null,message:'의견이 접수되었습니다. 검토 후 필요한 경우 답변하거나 공개합니다.'});
}
