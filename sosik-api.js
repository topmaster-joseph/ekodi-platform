import { ORGANIZATIONS, AUDIENCES, FORMATS, KINDS, clean, email, photoKeys, safePhotoKey, permittedForAudience, canPublishPublic, draftText, duplicateFingerprint } from './sosik-core.js';
import { buildCoreAiGateway } from './core-ai-gateway.js';

const PREFIX='/api/sosik';
const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const OWNER_EMAILS=new Set(['topmaster.joseph@gmail.com','joseph@ekodi.kr']);
const TARGETS=new Set(['church','mission']);
const MAX_UPLOAD=5*1024*1024;
const mimeExtension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(code,status=400)=>json({ok:false,error:code},status);
const noStore=(response)=>{const h=new Headers(response.headers);h.set('cache-control','private, no-store');h.set('x-content-type-options','nosniff');return new Response(response.body,{status:response.status,headers:h});};
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
const allowedOrigin=req=>!req.headers.get('origin')||req.headers.get('origin')==='https://ekodi.kr';
function cors(request,response){
  const origin=request.headers.get('origin');
  if(origin==='https://ekodi.kr'){
    const headers=new Headers(response.headers);
    headers.set('access-control-allow-origin',origin);
    headers.set('vary','Origin');
    return new Response(response.body,{status:response.status,headers});
  }
  return response;
}
async function actor(request,env){
  const raw=request.headers.get('authorization')||'';
  const token=raw.match(/^Bearer\s+(\S+)$/i)?.[1]||'';
  if(!token||token.length>8192)return null;
  const url=clean(env.SUPABASE_URL||SUPABASE_URL,500);
  const key=clean(env.SUPABASE_PUBLISHABLE_KEY||SUPABASE_KEY,300);
  let response;
  try { response=await fetch(url+'/auth/v1/user',{headers:{apikey:key,authorization:'Bearer '+token},cache:'no-store'}); }
  catch { return null; }
  if(!response.ok)return null;
  const user=await response.json().catch(()=>null);
  if(!user?.id||!user.email_confirmed_at)return null;
  const identity=email(user.email);
  if(!OWNER_EMAILS.has(identity))return null;
  return {id:String(user.id),email:identity};
}
async function audit(env,user,action,ref=''){
  await env.DB.prepare('INSERT INTO sosik_audit (id,actor_id,event,resource_id,occurred_at) VALUES (?,?,?,?,?)')
    .bind(id(),user?.id||null,action,clean(ref,120),now()).run();
}
async function bodyJson(req) {
  if(Number(req.headers.get('content-length')||0)>250000)return null;
  try {return await req.json();}catch{return null;}
}
function publicRow(row) {
  return {id:row.id,organization:row.organization,kind:row.kind,date:row.occurred_on,title:row.title,body:row.body,photoKeys:photoKeys(JSON.parse(row.photo_keys_json||'[]')),publishedAt:row.published_at};
}
function privateRow(row) {
  return {...publicRow(row),visibility:row.visibility,peoplePresent:!!row.people_present,publicConsent:!!row.public_consent,externalConsent:!!row.external_consent};
}
async function feed(request,env){
  const params=new URL(request.url).searchParams;
  const org=params.get('org');
  if(!TARGETS.has(org))return fail('ORGANIZATION_REQUIRED');
  const rows=await env.DB.prepare("SELECT * FROM sosik_entries WHERE organization IN (?, 'joint') AND visibility='public' AND public_consent=1 AND published_at IS NOT NULL ORDER BY occurred_on DESC,created_at DESC LIMIT 30").bind(org).all();
  return json({ok:true,organization:org,items:(rows.results||[]).map(publicRow)});
}
async function media(request,env,url) {
  const key=url.searchParams.get('key')||'';
  if(!safePhotoKey(key))return fail('INVALID_PHOTO_KEY');
  const bucket=env.LIVE_RECORDINGS_BUCKET;
  if(!bucket)return fail('MEDIA_STORAGE_NOT_READY',503);
  let permitted=false;
  const row=await env.DB.prepare("SELECT id FROM sosik_entries WHERE visibility='public' AND public_consent=1 AND published_at IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(sosik_entries.photo_keys_json) WHERE value=?) LIMIT 1").bind(key).first();
  if(row)permitted=true;
  if(!permitted && await actor(request,env))permitted=true;
  if(!permitted)return fail('MEDIA_ACCESS_DENIED',403);
  const file=await bucket.get(key);
  if(!file)return fail('MEDIA_NOT_FOUND',404);
  return new Response(file.body,{headers:{'content-type':file.httpMetadata?.contentType||'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});
}
async function upload(request,env,user){
  const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!mimeExtension[mime])return fail('UNSUPPORTED_MEDIA_TYPE',415);
  if(Number(request.headers.get('content-length')||0)>MAX_UPLOAD)return fail('IMAGE_TOO_LARGE',413);
  if(!env.LIVE_RECORDINGS_BUCKET)return fail('MEDIA_STORAGE_NOT_READY',503);
  const bytes=await request.arrayBuffer();
  if(bytes.byteLength<8||bytes.byteLength>MAX_UPLOAD)return fail('INVALID_IMAGE_SIZE',413);
  const b=new Uint8Array(bytes);
  if(mime==='image/jpeg' && !(b[0]===255&&b[1]===216&&b[2]===255))return fail('INVALID_IMAGE_BYTES');
  if(mime==='image/png' && !(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71))return fail('INVALID_IMAGE_BYTES');
  if(mime==='image/webp' && !(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP'))return fail('INVALID_IMAGE_BYTES');
  const key='sosik/media/'+id()+'.'+mimeExtension[mime];
  await env.LIVE_RECORDINGS_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{visibility:'private'}});
  await audit(env,user,'media.upload',key);
  return json({ok:true,key},201);
}
async function entries(request,env){
  const params=new URL(request.url).searchParams;
  const org=params.get('org')||'';
  const kind=params.get('kind')||'';
  const from=params.get('from')||'0000-01-01';
  const to=params.get('to')||'9999-12-31';
  const rows=await env.DB.prepare("SELECT * FROM sosik_entries WHERE (?='' OR organization=? OR organization='joint') AND (?='' OR kind=?) AND occurred_on BETWEEN ? AND ? ORDER BY occurred_on DESC,created_at DESC LIMIT 150")
    .bind(org,org,kind,kind,from,to).all();
  return json({ok:true,items:(rows.results||[]).map(privateRow)});
}
function entryInput(value){
  const v=value||{};
  const organization=clean(v.organization,20),kind=clean(v.kind,30);
  const occurred_on=clean(v.date,10),title=clean(v.title,200),body=clean(v.body,5000);
  const visibility=clean(v.visibility||'supporters',20);
  if(!ORGANIZATIONS.includes(organization)||!KINDS.includes(kind)||!validDate(occurred_on)||!title||!['public','supporters','external'].includes(visibility))return null;
  const photos=photoKeys(v.photoKeys);
  if(Array.isArray(v.photoKeys)&&photos.length!==v.photoKeys.length)return null;
  return {organization,kind,occurred_on,title,body,visibility,people_present:v.peoplePresent===true?1:0,public_consent:v.publicConsent===true?1:0,external_consent:v.externalConsent===true?1:0,photos};
}
async function saveEntry(req,env,user,entryId) {
  const v=entryInput(await bodyJson(req));
  if(!v)return fail('INVALID_ENTRY');
  const nowAt=now();
  if(entryId){
    const existing=await env.DB.prepare('SELECT id FROM sosik_entries WHERE id=?').bind(entryId).first();
    if(!existing)return fail('ENTRY_NOT_FOUND',404);
    await env.DB.prepare("UPDATE sosik_entries SET organization=?,kind=?,occurred_on=?,title=?,body=?,visibility=?,people_present=?,public_consent=?,external_consent=?,photo_keys_json=?,published_at=NULL,approved_by=NULL,updated_at=? WHERE id=?")
      .bind(v.organization,v.kind,v.occurred_on,v.title,v.body,v.visibility,v.people_present,v.public_consent,v.external_consent,JSON.stringify(v.photos),nowAt,entryId).run();
    await audit(env,user,'entry.update',entryId);
    return json({ok:true,id:entryId,published:false});
  }
  const key=id();
  await env.DB.prepare('INSERT INTO sosik_entries (id,organization,kind,occurred_on,title,body,visibility,people_present,public_consent,external_consent,photo_keys_json,author_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(key,v.organization,v.kind,v.occurred_on,v.title,v.body,v.visibility,v.people_present,v.public_consent,v.external_consent,JSON.stringify(v.photos),user.id,nowAt,nowAt).run();
  await audit(env,user,'entry.create',key);
  return json({ok:true,id:key,published:false},201);
}
async function publishEntry(env,user,entryId){
  const row=await env.DB.prepare('SELECT * FROM sosik_entries WHERE id=?').bind(entryId).first();
  if(!row)return fail('ENTRY_NOT_FOUND',404);
  if(!canPublishPublic(row))return fail('PUBLIC_CONSENT_REQUIRED',409);
  await env.DB.prepare('UPDATE sosik_entries SET published_at=?,approved_by=?,updated_at=? WHERE id=?')
    .bind(now(),user.id,now(),entryId).run();
  await audit(env,user,'entry.publish',entryId);
  return json({ok:true,id:entryId});
}
async function subscribe(req,env){
  const data=await bodyJson(req);
  if(!data||clean(data.website,200)||data.consent!==true)return fail('EXPLICIT_CONSENT_REQUIRED');
  const org=clean(data.organization,15),audience=clean(data.audience,20),address=email(data.email);
  if(!TARGETS.has(org)||!['supporters','prayer'].includes(audience)||!address)return fail('INVALID_SUBSCRIPTION');
  const existing=await env.DB.prepare('SELECT status FROM sosik_contacts WHERE organization=? AND audience=? AND email=?').bind(org,audience,address).first();
  if(existing)return json({ok:true,status:'pending',message:'신청이 접수되었습니다. 담당자 확인 후 동의 검증 안내가 제공됩니다.'});
  const key=id();
  await env.DB.prepare("INSERT INTO sosik_contacts (id,organization,audience,email,display_name,consent_at,consent_source,status,unsubscribe_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(key,org,audience,address,clean(data.name,80),now(),'web-optin-awaiting-verification','pending',id()+id(),now(),now()).run();
  return json({ok:true,status:'pending',message:'신청이 접수되었습니다. 담당자 확인 후 동의 검증 안내가 제공됩니다.',contact:'에코디 사역소식 담당자 · ekodi.kr/sosik'},202);
}
async function unsubscribe(req,env){
  const data=await bodyJson(req);
  const token=clean(data?.token,90);
  if(!/^[0-9a-f-]{72}$/.test(token))return fail('INVALID_TOKEN');
  const changed=await env.DB.prepare("UPDATE sosik_contacts SET status='unsubscribed',updated_at=? WHERE unsubscribe_token=?").bind(now(),token).run();
  if(!changed.meta?.changes)await env.DB.prepare('UPDATE sosik_test_unsubscribes SET used_at=? WHERE token=?').bind(now(),token).run();
  return json({ok:true,message:'수신거부 요청을 처리했습니다. 더 이상 해당 구독으로 발송되지 않습니다.'});
}
async function contacts(request,env){
  const params=new URL(request.url).searchParams;
  const org=params.get('org')||'';
  if(!TARGETS.has(org))return fail('ORGANIZATION_REQUIRED');
  const rows=await env.DB.prepare('SELECT id,organization,audience,email,display_name,consent_at,consent_source,status,created_at FROM sosik_contacts WHERE organization=? ORDER BY created_at DESC LIMIT 500').bind(org).all();
  return json({ok:true,items:rows.results||[]});
}
async function importContacts(req,env,user){
  const data=await bodyJson(req),org=clean(data?.organization,15);
  if(!TARGETS.has(org)||!Array.isArray(data?.rows)||data.rows.length>250)return fail('IMPORT_LIMIT_OR_ORG_INVALID');
  const rows=data.rows.map(x=>({audience:clean(x.audience,20),email:email(x.email),name:clean(x.name,80),consentAt:clean(x.consentAt,40),source:clean(x.source,180)}));
  if(rows.some(x=>!['supporters','prayer','fan','missionfund'].includes(x.audience)||!x.email||!x.source||!x.consentAt||Number.isNaN(Date.parse(x.consentAt))))return fail('CONSENT_PROOF_REQUIRED');
  let imported=0;
  for(const row of rows){
    const token=id()+id(),pk=id();
    const result=await env.DB.prepare("INSERT OR IGNORE INTO sosik_contacts (id,organization,audience,email,display_name,consent_at,consent_source,status,unsubscribe_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',?,?,?)")
      .bind(pk,org,row.audience,row.email,row.name,row.consentAt,row.source,token,now(),now()).run();
    const inserted=Number(result.meta?.changes||0);
    if(inserted){imported++;}
    else {
      const activated=await env.DB.prepare("UPDATE sosik_contacts SET display_name=?,consent_at=?,consent_source=?,status='active',updated_at=? WHERE organization=? AND audience=? AND email=? AND status='pending'")
        .bind(row.name,row.consentAt,row.source,now(),org,row.audience,row.email).run();
      imported+=Number(activated.meta?.changes||0);
    }
  }
  await audit(env,user,'contacts.import',org);
  return json({ok:true,imported,existing:rows.length-imported});
}
async function activateContact(req,env,user,key){
  const input=await bodyJson(req),proof=clean(input?.proof,180),consentAt=clean(input?.consentAt,40);
  if(!proof||!consentAt||Number.isNaN(Date.parse(consentAt)))return fail('CONSENT_PROOF_REQUIRED');
  const changed=await env.DB.prepare("UPDATE sosik_contacts SET status='active',consent_at=?,consent_source=?,updated_at=? WHERE id=? AND status='pending'")
    .bind(consentAt,proof,now(),key).run();
  if(!changed.meta?.changes)return fail('PENDING_CONTACT_NOT_FOUND',404);
  await audit(env,user,'contacts.activate',key);
  return json({ok:true,message:'동의 증빙 확인 후 활성화했습니다.'});
}
async function publications(env){
  const rows=await env.DB.prepare("SELECT id,organization,audience,format,title,body,ai_mode,status,approved_at,created_at FROM sosik_publications ORDER BY created_at DESC LIMIT 60").all();
  return json({ok:true,items:rows.results||[]});
}
async function createPublication(req,env,user){
  const data=await bodyJson(req),org=clean(data?.organization,16),audience=clean(data?.audience,20),format=clean(data?.format,20);
  const ids=Array.isArray(data?.ids)?[...new Set(data.ids.map(x=>clean(x,60)))].slice(0,80):[];
  if(!TARGETS.has(org)||!AUDIENCES.includes(audience)||!FORMATS.includes(format)||!ids.length||ids.length>40)return fail('INVALID_SELECTION');
  if((audience==='site')&&format==='missionfund')return fail('INVALID_AUDIENCE_FORMAT');
  const items=[];
  for(const entryId of ids){
    const entry=await env.DB.prepare('SELECT * FROM sosik_entries WHERE id=?').bind(entryId).first();
    if(!entry||!permittedForAudience(entry,audience,org))return fail('SELECTION_NOT_ELIGIBLE',409);
    items.push(entry);
  }
  const key=id(),title=clean(data.title||'사역소식 '+new Date().toISOString().slice(0,10),180);
  const facts=draftText(items,{organization:org,format,title});
  // Only aggregated and non-identifying metadata is supplied to the existing EKODI AI gateway.
  // Person names, photos, contact details, visas and free-text field notes never enter the AI request.
  const kindCounts=Object.fromEntries(KINDS.map(kind=>[kind,items.filter(entry=>entry.kind===kind).length]));
  let intro='',aiMode='template';
  try{
    const response=await buildCoreAiGateway(env).run({
      taskName:'sosik-approved-ministry-introduction',timeoutMs:2400,totalTimeoutMs:4500,
      context:{message:'한국어 사역소식 편지의 간결하고 따뜻한 인사말만 2문장 이내로 작성. 다음 집계 정보 외의 사람, 장소, 날짜, 행사 결과나 수치를 만들어 내지 마세요. 인사말만 출력하세요.',organization:org,audience,format,activitiesTotal:items.length,activityKinds:kindCounts},
      fallback:()=>({text:''}),
    });
    const suggestion=clean(response?.value?.text,600);
    if(response?.mode==='ai'&&suggestion&&!/\b(?:Bearer|sk-proj-|api[_ -]?key)\b/i.test(suggestion)){
      intro=suggestion;aiMode='ekodi-gateway-introduction';
    }
  }catch(error){console.warn('SOSIK_AI_FALLBACK',clean(error?.message,60));}
  const text=intro?intro+'\n\n'+facts:facts;
  await env.DB.prepare('INSERT INTO sosik_publications (id,organization,audience,format,selected_ids_json,title,body,ai_mode,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,? ,?, ?,?,?)')
    .bind(key,org,audience,format,JSON.stringify(ids),title,text,aiMode,'draft',user.id,now(),now()).run();
  await audit(env,user,'publication.draft',key);
  return json({ok:true,id:key,body:text,aiMode,message:aiMode==='template'?'사실 기반 템플릿 초안 생성. EKODI AI가 비활성 또는 사용 불가하여 AI 작성으로 표시하지 않습니다.':'EKODI 중앙 AI가 비식별 집계 기반 인사말을 보완했습니다. 사실 기록은 원문을 보존했고 사람 검토가 필요합니다.'},201);
}
async function updatePublication(req,env,user,key){
  const data=await bodyJson(req);
  const row=await env.DB.prepare('SELECT id,status FROM sosik_publications WHERE id=?').bind(key).first();
  if(!row)return fail('PUBLICATION_NOT_FOUND',404);
  if(row.status!=='draft')return fail('APPROVED_PUBLICATION_IMMUTABLE',409);
  const body=clean(data?.body,20000);
  if(body.length<20)return fail('PUBLICATION_BODY_REQUIRED');
  await env.DB.prepare('UPDATE sosik_publications SET body=?,updated_at=? WHERE id=?').bind(body,now(),key).run();
  await audit(env,user,'publication.edit',key);
  return json({ok:true});
}
async function approvePublication(env,user,key){
  const row=await env.DB.prepare('SELECT id,status,body FROM sosik_publications WHERE id=?').bind(key).first();
  if(!row)return fail('PUBLICATION_NOT_FOUND',404);
  if(row.status!=='draft'||!clean(row.body,20000))return fail('INVALID_APPROVAL_STATE',409);
  await env.DB.prepare("UPDATE sosik_publications SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=?")
    .bind(user.id,now(),now(),key).run();
  await audit(env,user,'publication.approve',key);
  return json({ok:true,status:'approved',message:'승인되었습니다. 외부 발송과 웹 제출은 별도 승인 및 검증이 필요합니다.'});
}
function utf8Base64Url(text){const bytes=new TextEncoder().encode(text);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function encodedHeader(value){const bytes=new TextEncoder().encode(value);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return '=?UTF-8?B?'+btoa(bin)+'?=';}
async function sendTestGmail(env,title,body,unsubscribeUrl){
  if(!env.GMAIL_CLIENT_ID||!env.GMAIL_CLIENT_SECRET||!env.GMAIL_REFRESH_TOKEN)throw new Error('GMAIL_NOT_CONFIGURED');
  const oauth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.GMAIL_REFRESH_TOKEN,grant_type:'refresh_token'})});
  const token=await oauth.json().catch(()=>({}));
  if(!oauth.ok||!token.access_token)throw new Error('MAIL_AUTH_FAILED');
  const mime=['To: topmaster.joseph@gmail.com','Subject: '+encodedHeader('[EKODI 사역소식 테스트] '+title),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: 8bit','List-Unsubscribe: <'+unsubscribeUrl+'>','','[승인된 시험 발송 · 외부 수신자 미발송]','',body,'','수신거부: '+unsubscribeUrl].join('\r\n');
  const result=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body:JSON.stringify({raw:utf8Base64Url(mime)})});
  const data=await result.json().catch(()=>({}));
  if(!result.ok||!data.id)throw new Error('MAIL_PROVIDER_REJECTED');
  return data.id;
}
async function testSend(env,user,key){
  const row=await env.DB.prepare('SELECT * FROM sosik_publications WHERE id=?').bind(key).first();
  if(!row)return fail('PUBLICATION_NOT_FOUND',404);
  if(row.status!=='approved'||!row.approved_by)return fail('APPROVAL_REQUIRED',409);
  const ids=JSON.parse(row.selected_ids_json||'[]'),fingerprint=duplicateFingerprint(ids.map(x=>({id:x})));
  // Revalidate consent and source freshness at the point of sending, not only at draft creation.
  for(const entryId of ids){
    const current=await env.DB.prepare('SELECT * FROM sosik_entries WHERE id=?').bind(entryId).first();
    if(!current||!permittedForAudience(current,row.audience,row.organization)||current.updated_at>row.created_at)return fail('SOURCE_CHANGED_OR_CONSENT_REVOKED',409);
  }
  const existed=await env.DB.prepare('SELECT status FROM sosik_deliveries WHERE publication_id=? AND recipient_email=?').bind(key,'topmaster.joseph@gmail.com').first();
  if(existed)return fail('DUPLICATE_TEST_SEND_BLOCKED',409);
  const duplicate=await env.DB.prepare("SELECT id FROM sosik_deliveries WHERE recipient_email=? AND payload_fingerprint=? AND status IN ('sent','sending') LIMIT 1")
    .bind('topmaster.joseph@gmail.com',fingerprint).first();
  if(duplicate)return fail('DUPLICATE_CONTENT_SEND_BLOCKED',409);
  const deliveryId=id();
  await env.DB.prepare("INSERT INTO sosik_deliveries (id,publication_id,recipient_email,audience,payload_fingerprint,status,created_at) VALUES (?,?,?,?,?,'sending',?)")
    .bind(deliveryId,key,'topmaster.joseph@gmail.com','test',fingerprint,now()).run();
  const token=id()+id();
  await env.DB.prepare('INSERT INTO sosik_test_unsubscribes (token,email) VALUES (?,?)').bind(token,'topmaster.joseph@gmail.com').run();
  try{
    const msgId=await sendTestGmail(env,row.title,row.body,'https://ekodi.kr/sosik/unsubscribe/?token='+token);
    await env.DB.prepare("UPDATE sosik_deliveries SET status='sent',provider_message_id=?,sent_at=? WHERE id=?").bind(msgId,now(),deliveryId).run();
    await audit(env,user,'publication.test_sent',key);
    return json({ok:true,message:'본인 메일 시험 발송 기록이 저장되었습니다.',recipient:'topmaster.joseph@gmail.com',deliveryId});
  }catch(error){
    await env.DB.prepare("UPDATE sosik_deliveries SET status='failed',error_code=? WHERE id=?").bind(clean(error?.message,80),deliveryId).run();
    return fail(clean(error?.message,80),503);
  }
}
async function deliveryLedger(env){
  const rows=await env.DB.prepare('SELECT id,publication_id,recipient_email,audience,status,sent_at,error_code FROM sosik_deliveries ORDER BY created_at DESC LIMIT 100').all();
  return json({ok:true,items:rows.results||[]});
}
export async function handleSosikRequest(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith(PREFIX))return null;
  if(!allowedOrigin(request))return fail('ORIGIN_NOT_ALLOWED',403);
  if(request.method==='OPTIONS')return cors(request,new Response(null,{status:204,headers:{'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type','access-control-max-age':'600'}}));
  if(!env?.DB)return cors(request,fail('DATABASE_NOT_CONFIGURED',503));
  try{
    let response=null;
    if(request.method==='GET'&&path===PREFIX+'/feed')response=await feed(request,env);
    else if(request.method==='GET'&&path===PREFIX+'/media')response=await media(request,env,url);
    else if(request.method==='POST'&&path===PREFIX+'/subscribe')response=await subscribe(request,env);
    else if(request.method==='POST'&&path===PREFIX+'/unsubscribe')response=await unsubscribe(request,env);
    else{
      const user=await actor(request,env);
      if(!user)return cors(request,fail('PUBLISHER_AUTH_REQUIRED',401));
      if(request.method==='POST'&&path===PREFIX+'/media')response=await upload(request,env,user);
      else if(request.method==='GET'&&path===PREFIX+'/entries')response=await entries(request,env);
      else if(request.method==='POST'&&path===PREFIX+'/entries')response=await saveEntry(request,env,user);
      else if(request.method==='PUT'&&/^\/api\/sosik\/entries\/[0-9a-f-]{36}$/.test(path))response=await saveEntry(request,env,user,path.split('/').at(-1));
      else if(request.method==='POST'&&/^\/api\/sosik\/entries\/[0-9a-f-]{36}\/publish$/.test(path))response=await publishEntry(env,user,path.split('/')[4]);
      else if(request.method==='GET'&&path===PREFIX+'/contacts')response=await contacts(request,env);
      else if(request.method==='POST'&&path===PREFIX+'/contacts/import')response=await importContacts(request,env,user);
      else if(request.method==='POST'&&/^\/api\/sosik\/contacts\/[0-9a-f-]{36}\/activate$/.test(path))response=await activateContact(request,env,user,path.split('/')[4]);
      else if(request.method==='GET'&&path===PREFIX+'/publications')response=await publications(env);
      else if(request.method==='POST'&&path===PREFIX+'/publications')response=await createPublication(request,env,user);
      else if(request.method==='PUT'&&/^\/api\/sosik\/publications\/[0-9a-f-]{36}$/.test(path))response=await updatePublication(request,env,user,path.split('/').at(-1));
      else if(request.method==='POST'&&/^\/api\/sosik\/publications\/[0-9a-f-]{36}\/approve$/.test(path))response=await approvePublication(env,user,path.split('/')[4]);
      else if(request.method==='POST'&&/^\/api\/sosik\/publications\/[0-9a-f-]{36}\/test-send$/.test(path))response=await testSend(env,user,path.split('/')[4]);
      else if(request.method==='GET'&&path===PREFIX+'/deliveries')response=await deliveryLedger(env);
      else if(request.method==='POST'&&(path.endsWith('/send')||path.endsWith('/submit')))response=fail('EXTERNAL_HUMAN_GATE_REQUIRED',403);
      else response=fail('ROUTE_NOT_FOUND',404);
    }
    return cors(request,noStore(response));
  }catch(error){
    console.error('SOSIK_API_ERROR',String(error?.message||'unknown').slice(0,120));
    return cors(request,fail('SOSIK_OPERATION_FAILED_OR_MIGRATION_REQUIRED',503));
  }
}
