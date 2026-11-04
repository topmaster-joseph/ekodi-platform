// Private EKODI Journal photo intake: reuse the EXISTING canonical Google Drive Storage binding.
// Never grants photo publication, rights approval, public URL, or new authentication.
import { verifyJournalSuperAdmin } from './journal-editorial-control.js';
import { storeEkodiDurableRecord } from './storage-gateway.js';

const BASE='/api/journal/editorial/media';
const MAX_BYTES=2*1024*1024;
const MAX_JSON=2_900_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9][a-z0-9-]{2,79}$/;
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store','x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow, noarchive'},
});
const fail=(code,status)=>json({ok:false,error:code},status);
const digest=async(value)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
 new TextEncoder().encode(String(value).toLowerCase().trim())))].map(x=>x.toString(16).padStart(2,'0')).join('');
const safe=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():'';
const summarize=row=>({
  id:row.id,draftSlug:row.draft_slug,alt:row.alt,caption:row.caption,credit:row.credit,
  rightsStatus:'pending',size:Number(row.byte_size),mimeType:'image/webp',
  createdAt:row.created_at,previewPath:BASE+'/'+row.id+'/file',
});
const ready=env=>env?.ENVIRONMENT==='production'&&Boolean(
 env?.DB?.prepare&&env?.DB?.batch&&env?.STORAGE?.fetch&&String(env?.EKODI_STORAGE_GATEWAY_KEY||'').trim()
);
function fourCC(b,i){return String.fromCharCode(b[i],b[i+1],b[i+2],b[i+3])}
export function validatePrivateWebp(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<30||bytes.length>MAX_BYTES)return false;
  if(fourCC(bytes,0)!=='RIFF'||fourCC(bytes,8)!=='WEBP')return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(4,true)!==bytes.length-8)return false;
  let offset=12,imageCount=0,count=0,extended=false,alpha=false,alphaChunk=false;
  let expectedWidth=0,expectedHeight=0,width=0,height=0,firstChunk=true;
  const chunks=new Set(['VP8 ','VP8L','VP8X','ALPH']);
  while(offset<bytes.length){
    if(offset+8>bytes.length||++count>8)return false;
    const kind=fourCC(bytes,offset),size=view.getUint32(offset+4,true);
    const at=offset+8;
    if(!chunks.has(kind)||!size||size>MAX_BYTES||at+size>bytes.length)return false;
    if(kind==='VP8X'){
      if(!firstChunk||extended||size!==10)return false;
      extended=true;alpha=Boolean(bytes[at]&0x10);
      if(bytes[at]&0xEF)return false; // reject ICC, animation, EXIF, XMP and reserved flags
      expectedWidth=1+bytes[at+4]+(bytes[at+5]<<8)+(bytes[at+6]<<16);
      expectedHeight=1+bytes[at+7]+(bytes[at+8]<<8)+(bytes[at+9]<<16);
    }else if(kind==='ALPH'){
      if(!extended||!alpha||alphaChunk||imageCount)return false;
      alphaChunk=true;
    }else if(kind==='VP8 '){
      if(imageCount++||size<10||bytes[at+3]!==0x9D||bytes[at+4]!==0x01||bytes[at+5]!==0x2A)return false;
      width=view.getUint16(at+6,true)&0x3FFF;
      height=view.getUint16(at+8,true)&0x3FFF;
    }else if(kind==='VP8L'){
      if(imageCount++||size<5||alphaChunk||bytes[at]!==0x2F)return false;
      width=1+bytes[at+1]+((bytes[at+2]&0x3F)<<8);
      height=1+(bytes[at+2]>>6)+(bytes[at+3]<<2)+((bytes[at+4]&0x0F)<<10);
    }
    firstChunk=false;
    offset=at+size+(size%2);
    if(offset>bytes.length)return false;
  }
  // Restrict decoded dimensions and compression structure, preventing metadata and huge image payloads.
  return offset===bytes.length&&imageCount===1&&width>0&&height>0&&
    width<=4096&&height<=4096&&width*height<=24_000_000&&
    (!extended||(expectedWidth===width&&expectedHeight===height))&&
    (!alphaChunk||alpha);
}
function decodeBase64(input){
  if(typeof input!=='string'||input.length>Math.ceil(MAX_BYTES*4/3)+8||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input))return null;
  try{
    const binary=atob(input);
    return binary.length<=MAX_BYTES?Uint8Array.from(binary,x=>x.charCodeAt(0)):null;
  }catch{return null}
}
const fetchStored=async(env,path,init={})=>{
  const headers=new Headers(init.headers||{});
  headers.set('x-ekodi-storage-key',String(env.EKODI_STORAGE_GATEWAY_KEY));
  return env.STORAGE.fetch(new Request('https://storage.internal/api/storage/v1'+path,{...init,headers}));
};
async function canUpload(env){
  if(!ready(env))return false;
  try{
    const response=await fetchStored(env,'/health');
    if(!response.ok)return false;
    const data=await response.json();
    return data?.canonicalDriveReady===true;
  }catch{return false}
}
async function disposeNewFile(env,fileId){
  if(!fileId)return;
  try{
    await fetchStored(env,'/delete-file',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({fileId}),
    });
  }catch{ /* Never hide the real database failure or leak a private file ID. */ }
}
const LIMIT=24;
export async function handleJournalPrivateMedia(request,env){
  const url=new URL(request.url);
  const path=url.pathname;
  if(path!==BASE&&!path.startsWith(BASE+'/'))return null;
  if(!['GET','POST'].includes(request.method))return fail('method_not_allowed',405);
  const tail=path.slice(BASE.length);
  if(request.method==='POST'&&(tail||request.headers.get('origin')!=='https://ekodi.kr'))return fail('origin_forbidden',403);

  let principal;
  try{principal=await verifyJournalSuperAdmin(request,env)}catch{return fail('auth_unavailable',503)}
  if(!principal)return fail('super_admin_required',403);
  if(!env?.DB?.prepare)return fail('media_store_unavailable',503);
  if(request.method==='GET'&&tail===''&&(!url.searchParams.has('slug')||!SLUG.test(url.searchParams.get('slug')||'')))return fail('invalid_slug',400);
  const match=tail.match(/^\/([a-f0-9-]+)\/file$/i);
  if(tail&&(!match||!UUID.test(match[1])||request.method!=='GET'))return fail('not_found',404);

  try{
    if(request.method==='GET'&&!tail){
      const found=await env.DB.prepare('SELECT id,draft_slug,alt,caption,credit,byte_size,created_at FROM journal_private_editorial_media WHERE draft_slug=? ORDER BY created_at DESC LIMIT 24')
        .bind(url.searchParams.get('slug')).all();
      return json({ok:true,uploadReady:await canUpload(env),media:(found.results||[]).map(summarize)});
    }
    if(request.method==='GET'){
      if(!ready(env))return fail('media_store_unavailable',503);
      const record=await env.DB.prepare('SELECT drive_file_id,mime_type,byte_size FROM journal_private_editorial_media WHERE id=?')
        .bind(match[1]).first();
      if(!record||record.mime_type!=='image/webp')return fail('not_found',404);
      const stored=await fetchStored(env,'/files/'+encodeURIComponent(record.drive_file_id));
      if(!stored.ok||!stored.body)return fail('media_store_unavailable',503);
      return new Response(stored.body,{status:200,headers:{
        'content-type':'image/webp','content-length':String(record.byte_size),
        'cache-control':'private, no-store','x-content-type-options':'nosniff',
        'cross-origin-resource-policy':'same-origin','x-robots-tag':'noindex, nofollow, noarchive',
      }});
    }

    if(!await canUpload(env))return fail('media_store_unavailable',503);
    if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('unsupported_media_type',415);
    if(Number(request.headers.get('content-length')||0)>MAX_JSON)return fail('payload_too_large',413);
    const input=await request.text().catch(()=>null);
    if(input===null||input.length>MAX_JSON)return fail('payload_too_large',413);
    let body;try{body=JSON.parse(input)}catch{return fail('invalid_json',400)}
    if(!body||typeof body!=='object'||Array.isArray(body))return fail('invalid_photo_metadata',400);
    const slug=String(body.draftSlug||'');
    const alt=safe(body.alt,200),caption=safe(body.caption||'',500),credit=safe(body.credit||'',150);
    if(!SLUG.test(slug)||alt.length<5||!credit||body.rightsAttested!==true)return fail('invalid_photo_metadata',400);
    const bytes=decodeBase64(body.contentBase64);
    if(!validatePrivateWebp(bytes))return fail('unsupported_private_image',415);
    const exists=await env.DB.prepare('SELECT slug FROM journal_private_editorial_drafts WHERE slug=?')
      .bind(slug).first();
    if(!exists)return fail('private_draft_required',409);
    const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM journal_private_editorial_media WHERE draft_slug=?')
      .bind(slug).first();
    if(Number(count?.total||0)>=LIMIT)return fail('photo_limit_reached',429);
    const id=crypto.randomUUID(),now=new Date().toISOString();
    const actor=await digest(principal.email);
    let storedId='';
    try{
      const stored=await storeEkodiDurableRecord(env,{
        spaceId:'ekodi',serviceId:'journal',recordType:'journal_photo_pending',
        createdBy:'journal-super-admin',retentionClass:'operational',
        storageRoute:'media',subfolderPath:'Journal/PrivateReview/'+slug,
        sourceModuleId:'journal-private-photo-intake',
        title:id+'.webp',mimeType:'image/webp',contentBase64:body.contentBase64,
      },{requestId:id});
      storedId=String(stored?.file?.id||'');
      if(!stored?.ok||!storedId)throw new Error('storage_receipt_missing');
    }catch{return fail('media_store_unavailable',503)}

    try{
      const put=env.DB.prepare('INSERT INTO journal_private_editorial_media(id,draft_slug,drive_file_id,mime_type,byte_size,alt,caption,credit,rights_status,actor_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
       .bind(id,slug,storedId,'image/webp',bytes.byteLength,alt,caption,credit,'pending',actor,now,now);
      const audit=env.DB.prepare("INSERT INTO journal_private_editorial_media_audit(id,media_id,action,actor_hash,created_at) VALUES(?,?,'photo_intake_pending_review',?,?)")
       .bind(crypto.randomUUID(),id,actor,now);
      const result=await env.DB.batch([put,audit]);
      if(Number(result?.[0]?.meta?.changes)!==1||Number(result?.[1]?.meta?.changes)!==1)throw new Error('media_audit_failed');
      return json({ok:true,media:{
       id,draftSlug:slug,alt,caption,credit,rightsStatus:'pending',
       size:bytes.byteLength,mimeType:'image/webp',createdAt:now,previewPath:BASE+'/'+id+'/file'
      }},201);
    }catch{
      await disposeNewFile(env,storedId);
      return fail('media_metadata_unavailable',503);
    }
  }catch(error){
    console.warn('[Journal] private media operation unavailable',error?.name||'error');
    return fail('media_store_unavailable',503);
  }
}
