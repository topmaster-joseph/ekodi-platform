// EKODI Education — instructor document share (강사 서류 공유).
//
// The instructor uploads a copy of their own ID card (신분증 사본) or bank-book page (통장 사본) and gets a
// share link. Anyone holding that link can view the file until the chosen expiry; afterwards the link answers
// 410 and the file is deleted. Nothing about learners is stored here.
//
// Safeguards
// - Upload, list and revoke require a signed-in instructor session (password configured + valid gate cookie);
//   they stay closed even when the studio runs in "open" mode.
// - Share links carry a 256-bit random token (the R2 object key); no guessable ids, no index of links.
// - Expiry is mandatory (1–30 days); expired objects are deleted on access and when the list is read.
// - Viewer and file responses: no-store, noindex, no-referrer, same-origin framing only; an on-screen
//   watermark shows the purpose and expiry. Only JPEG/PNG/WebP/PDF (checked by magic bytes), ≤10 MB.
// - Storage: the existing ekodi-storage R2 bucket (binding EDU_DOCS) under edu/instructor-docs/. Without the
//   binding (e.g. isolated staging) the feature answers 503.
import { hasInstructorSession, isSameSiteRequest } from './education-instructor-gate.js';

export const DOCS_PREFIX='edu/instructor-docs/';
export const DOC_KINDS=Object.freeze({id:'신분증 사본',bank:'통장 사본'});
export const MAX_BYTES=10*1024*1024;
export const EXPIRY_DAYS=Object.freeze([1,3,7,14,30]);
const DAY=86400000;
const TOKEN_RE=/^[A-Za-z0-9_-]{43}$/;
const BASE='/study/live/docs/';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const PRIVATE={'cache-control':'no-store, private','x-robots-tag':'noindex, nofollow, noarchive','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...PRIVATE}});}

export function newToken(){const b=crypto.getRandomValues(new Uint8Array(32));let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function sniffType(bytes){
  const b=new Uint8Array(bytes.slice(0,12));
  if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'image/jpeg';
  if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return 'image/png';
  if(b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50)return 'image/webp';
  if(b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46)return 'application/pdf';
  return '';
}
const fmt=ms=>{const d=new Date(ms+9*3600000);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0')+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');};
function meta(obj){
  const m=obj?.customMetadata||{};
  return {kind:DOC_KINDS[m.kind]?m.kind:'id',label:DOC_KINDS[m.kind]||'서류',purpose:clean(m.purpose,80),expiresAt:Number(m.expiresAt)||0,createdAt:Number(m.createdAt)||0,size:obj?.size||0};
}
async function liveObject(env,token,now){
  const obj=await env.EDU_DOCS.get(DOCS_PREFIX+token);
  if(!obj)return {state:'missing'};
  const m=meta(obj);
  if(!m.expiresAt||m.expiresAt<=now){await env.EDU_DOCS.delete(DOCS_PREFIX+token).catch(()=>{});return {state:'expired'};}
  return {state:'ok',obj,m};
}
// Share links are returned relative to the manager page (docs/): the client resolves them against its own
// address, so the same response works under ekodi.kr/edu (canonical router) and on the Education origin.
const sharePath=token=>'s/'+token;

function viewerPage({m,token,contentType}){
  const file='../f/'+token, isPdf=contentType==='application/pdf';
  const mark=esc((m.purpose||'제출 확인용')+' · '+fmt(m.expiresAt)+'까지 열람 가능');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>'+esc(m.label)+' · 강사 제출 서류</title>'+
    '<link rel="stylesheet" href="../../../../fonts/pretendard/pretendardvariable-dynamic-subset.css"><link rel="stylesheet" href="../../live.css"></head><body class="lv doc-view-body" data-live-surface="doc-view">'+
    '<main class="doc-view"><header class="doc-head"><p class="eyebrow">EKODI EDUCATION · 강사 제출 서류</p><h1>'+esc(m.label)+'</h1>'+
    '<p class="meta">'+(m.purpose?esc(m.purpose)+' · ':'')+'열람 기한 '+esc(fmt(m.expiresAt))+' (한국시간)</p></header>'+
    '<figure class="doc-frame">'+(isPdf?'<object class="doc-pdf" data="'+file+'" type="application/pdf"><p class="meta">PDF 미리보기를 지원하지 않는 브라우저입니다. 아래 「내려받기」를 눌러 주세요.</p></object>'
      :'<img class="doc-img" src="'+file+'" alt="'+esc(m.label)+'">')+
    '<figcaption class="doc-mark" aria-hidden="true">'+mark+'</figcaption></figure>'+
    '<p class="btn-row"><a class="btn btn-primary" href="'+file+'?download=1">내려받기</a></p>'+
    '<p class="meta doc-note">이 링크는 공유받은 분만 열람하도록 만든 것입니다. 기한이 지나면 자동으로 삭제됩니다. 다른 곳에 다시 게시하지 말아 주세요.</p></main></body></html>';
}
function goneHtml(state){
  const msg=state==='expired'?'열람 기한이 지나 삭제된 서류입니다.':'없는 링크이거나 이미 삭제된 서류입니다.';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>열람할 수 없는 서류</title><link rel="stylesheet" href="../../../../fonts/pretendard/pretendardvariable-dynamic-subset.css"><link rel="stylesheet" href="../../live.css"></head>'+
    '<body class="lv doc-view-body"><main class="doc-view"><h1>열람할 수 없습니다</h1><p class="meta">'+msg+' 강사에게 새 링크를 요청해 주세요.</p></main></body></html>';
}
function html(body,status){return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8',...PRIVATE,
  'content-security-policy':"default-src 'self'; img-src 'self'; object-src 'self'; style-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});}

// Returns a Response for /study/live/docs/{s,f,api}/…, or null for anything else.
export async function instructorDocs(request,env,{url=new URL(request.url),now=Date.now()}={}){
  const p=url.pathname;
  if(!p.startsWith(BASE+'s/')&&!p.startsWith(BASE+'f/')&&!p.startsWith(BASE+'api/'))return null;
  const method=request.method.toUpperCase();
  if(!env?.EDU_DOCS)return p.startsWith(BASE+'api/')?json({ok:false,code:'storage_not_configured',message:'서류 저장소가 설정되지 않은 환경입니다.'},503):html(goneHtml('missing'),503);

  // Public share view and file (token holders only, until expiry).
  if(p.startsWith(BASE+'s/')||p.startsWith(BASE+'f/')){
    if(method!=='GET'&&method!=='HEAD')return new Response('method not allowed',{status:405,headers:{allow:'GET, HEAD',...PRIVATE}});
    const token=p.slice(BASE.length+2);
    if(!TOKEN_RE.test(token))return html(goneHtml('missing'),404);
    const r=await liveObject(env,token,now);
    if(r.state!=='ok')return html(goneHtml(r.state),r.state==='expired'?410:404);
    const contentType=r.obj.httpMetadata?.contentType||'application/octet-stream';
    if(p.startsWith(BASE+'s/'))return html(viewerPage({m:r.m,token,contentType}),200);
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[contentType]||'bin';
    const name=(r.m.kind==='bank'?'bank-copy':'id-copy')+'.'+ext;
    return new Response(method==='HEAD'?null:r.obj.body,{headers:{'content-type':contentType,...PRIVATE,
      'content-disposition':(url.searchParams.get('download')?'attachment':'inline')+'; filename="'+name+'"',
      'content-security-policy':"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",'x-frame-options':'SAMEORIGIN'}});
  }

  // Instructor management API.
  if(!(await hasInstructorSession(request,env)))return json({ok:false,code:'instructor_session_required',message:'강사 비밀번호로 먼저 로그인해 주세요.'},401);
  const route=p.slice(BASE.length+4);
  if(method==='GET'&&route==='list'){
    const out=[];let cursor;
    do{
      const page=await env.EDU_DOCS.list({prefix:DOCS_PREFIX,cursor,include:['customMetadata','httpMetadata']});
      for(const o of page.objects){
        const token=o.key.slice(DOCS_PREFIX.length);const m=meta(o);
        if(!m.expiresAt||m.expiresAt<=now){await env.EDU_DOCS.delete(o.key).catch(()=>{});continue;}
        out.push({token,kind:m.kind,label:m.label,purpose:m.purpose,expiresAt:m.expiresAt,createdAt:m.createdAt,size:o.size,type:o.httpMetadata?.contentType||'',path:sharePath(token)});
      }
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
    out.sort((a,b)=>b.createdAt-a.createdAt);
    return json({ok:true,items:out});
  }
  if(method!=='POST')return json({ok:false,code:'method_not_allowed'},405);
  if(!request.headers.get('origin')||!isSameSiteRequest(request,url))return json({ok:false,code:'cross_site_refused'},403);
  if(route==='delete'){
    let body={};try{body=await request.json();}catch{}
    if(!TOKEN_RE.test(String(body.token||'')))return json({ok:false,code:'bad_token'},400);
    await env.EDU_DOCS.delete(DOCS_PREFIX+body.token);
    return json({ok:true});
  }
  if(route==='upload'){
    if(Number(request.headers.get('content-length')||0)>MAX_BYTES+64*1024)return json({ok:false,code:'too_large',message:'파일은 10MB 이하로 올려 주세요.'},413);
    let form;try{form=await request.formData();}catch{return json({ok:false,code:'bad_form'},400);}
    const kind=String(form.get('kind')||'');const file=form.get('file');
    const days=Number(form.get('days'));const purpose=clean(form.get('purpose'),80);
    if(!DOC_KINDS[kind])return json({ok:false,code:'bad_kind'},400);
    if(!EXPIRY_DAYS.includes(days))return json({ok:false,code:'bad_expiry',message:'열람 기간을 골라 주세요.'},400);
    if(!file||typeof file.arrayBuffer!=='function'||!file.size)return json({ok:false,code:'no_file',message:'파일을 선택해 주세요.'},400);
    if(file.size>MAX_BYTES)return json({ok:false,code:'too_large',message:'파일은 10MB 이하로 올려 주세요.'},413);
    const bytes=await file.arrayBuffer();const type=sniffType(bytes);
    if(!type)return json({ok:false,code:'bad_type',message:'JPG·PNG·WebP 이미지 또는 PDF만 올릴 수 있습니다.'},415);
    const token=newToken();const expiresAt=now+days*DAY;
    await env.EDU_DOCS.put(DOCS_PREFIX+token,bytes,{httpMetadata:{contentType:type},customMetadata:{kind,purpose,expiresAt:String(expiresAt),createdAt:String(now)}});
    return json({ok:true,item:{token,kind,label:DOC_KINDS[kind],purpose,expiresAt,createdAt:now,size:file.size,type,path:sharePath(token)}},201);
  }
  return json({ok:false,code:'not_found'},404);
}
