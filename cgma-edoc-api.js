// 청계면상인회(cgma) 전자문서 · 순차 전자서명 · 기록관리 API (Control API, D1 ekodi-auth + private R2).
//
// Administrator endpoints (Bearer session, cgma tenant authority resolved server-side):
//   GET  /api/cgma/edocs                          문서 목록 (?status=&q=&year=)
//   POST /api/cgma/edocs                          새 문서(초안) + 서명자 순서
//   GET  /api/cgma/edocs/{id}                     상세 · 서명자 · 이력
//   PUT  /api/cgma/edocs/{id}/file                원본 파일(PDF/PNG/JPEG) 업로드 — 초안에서만
//   GET  /api/cgma/edocs/{id}/file                원본 파일
//   POST /api/cgma/edocs/{id}/start               서명 요청 시작(서명 링크 발급)
//   POST /api/cgma/edocs/{id}/cancel              취소(사유 기록, 물리 삭제 없음)
//   POST /api/cgma/edocs/{id}/signers/{seq}/reissue  해당 서명자 링크 재발급
// Signer endpoints (possession of the signing link; header x-ekodi-sign-token):
//   GET  /api/cgma/edocs/sign                     내 서명 화면 정보
//   GET  /api/cgma/edocs/sign/file                원본 파일
//   POST /api/cgma/edocs/sign                     서명 제출
//
// Invariants
// - Signing order is strictly left → right (seq 1..n). Only the single 'active' signer can sign; every
//   later link answers SIGN_NOT_YOUR_TURN until the previous signer has signed. The state change is one
//   D1 batch guarded by the active status, so two concurrent submissions can never both succeed.
// - The server time (UTC ISO, shown in KST) is the signing date. The signer must confirm the SHA-256 of
//   the exact content shown; a changed file can never collect a signature meant for another version.
// - Content is immutable after the request starts. Documents are never physically deleted.
// - Every state change appends a hash-chained event (prev_hash → event_hash) for later verification.
// - Signatures are vector strokes (no images), rendered as inline SVG under strict CSP.
// - Signer IP addresses are stored only as a document-scoped SHA-256 hash.
import { resolveTenantAccessAuthority } from './tenant-access-authority.js';

export const EDOC_API_PREFIX='/api/cgma/edocs';
export const EDOC_TENANT='cgma';
export const EDOC_CATEGORIES=Object.freeze(['회의록','제안서·견적서','결의서','계약·협약','공문','회계·정산','기타']);
export const DEFAULT_SIGNER_ROLES=Object.freeze(['총무','사무국장','상인회장']);
export const MAX_FILE_BYTES=20*1024*1024;
export const LINK_TTL_MS=30*24*60*60*1000;
export const SIGN_PAGE_URL='https://ekodi.kr/cgma/sign/';
const MAX_JSON=256*1024;
const MAX_SIGNERS=10;
const MAX_STROKES=80,MAX_POINTS=6000,MIN_POINTS=8;
const ALLOWED_ORIGIN='https://ekodi.kr';
const enc=new TextEncoder(),dec=new TextDecoder();
const FILE_TYPES=Object.freeze({
  'application/pdf':{ext:'pdf',magic:[0x25,0x50,0x44,0x46]},
  'image/png':{ext:'png',magic:[0x89,0x50,0x4e,0x47]},
  'image/jpeg':{ext:'jpg',magic:[0xff,0xd8,0xff]},
});

// ---------- primitives ----------
function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{
    'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-ekodi-route':'cgma-edocs',...extra,
  }});
}
const fail=(code,message,status=400,extra)=>json({ok:false,code,error:message},status,extra);
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim():'';
const within=(value,max)=>value.length>0&&[...value].length<=max;
export const normalizeName=value=>String(value||'').normalize('NFC').replace(/\s+/g,'').toLowerCase();
const hex=buf=>Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256Hex(data){return hex(await crypto.subtle.digest('SHA-256',typeof data==='string'?enc.encode(data):data));}
function b64u(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function newSignToken(){return b64u(crypto.getRandomValues(new Uint8Array(32)));}
export const signLink=token=>`${SIGN_PAGE_URL}#${token}`;
const isToken=value=>/^[A-Za-z0-9_-]{43}$/.test(String(value||''));
const clientAddress=request=>String(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown').slice(0,64);

function sameOriginWrite(request){
  const origin=request.headers.get('origin');
  if(origin&&origin!==ALLOWED_ORIGIN)return false;
  const site=request.headers.get('sec-fetch-site');
  if(site&&!['same-origin','none'].includes(site))return false;
  return request.headers.get('x-ekodi-edoc-request')==='1';
}
async function readBody(request,limit){
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>limit)return {tooLarge:true};
  const reader=request.body?.getReader();
  if(!reader)return {bytes:new Uint8Array(0)};
  const chunks=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel().catch(()=>{});return {tooLarge:true};}
      chunks.push(value);
    }
  }finally{try{reader.releaseLock()}catch{}}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
  return {bytes};
}
async function readJson(request){
  if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return {invalidType:true};
  const body=await readBody(request,MAX_JSON);
  if(body.tooLarge)return body;
  try{return {value:JSON.parse(dec.decode(body.bytes)||'null')}}catch{return {value:null}}
}

// ---------- validation (exported for tests) ----------
export function validateDraft(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,code:'INVALID_BODY'};
  const title=clean(body.title),category=clean(body.category),summary=clean(body.summary);
  const contentKind=body.content_kind==='text'?'text':'file';
  const bodyText=contentKind==='text'?clean(body.body_text):'';
  if(!within(title,120))return {ok:false,code:'TITLE_INVALID'};
  if(!EDOC_CATEGORIES.includes(category))return {ok:false,code:'CATEGORY_INVALID'};
  if([...summary].length>500)return {ok:false,code:'SUMMARY_TOO_LONG'};
  if(contentKind==='text'&&!within(bodyText,20000))return {ok:false,code:'BODY_TEXT_INVALID'};
  const mode=body.mode==='archive'?'archive':'sign';
  const docDate=clean(body.doc_date);
  if(docDate&&!/^\d{4}-\d{2}-\d{2}$/.test(docDate))return {ok:false,code:'DOC_DATE_INVALID'};
  const sourceNote=clean(body.source_note);
  if([...sourceNote].length>200)return {ok:false,code:'SOURCE_NOTE_TOO_LONG'};
  const signers=mode==='archive'?[]:validateSigners(body.signers);
  if(!signers)return {ok:false,code:'SIGNERS_INVALID'};
  return {ok:true,value:{title,category,summary,contentKind,bodyText,signers,mode,docDate,sourceNote}};
}
// A signer plan: 1..10 rows, role required; the name may be filled in later (before the request starts).
export function validateSigners(list){
  if(!Array.isArray(list)||list.length<1||list.length>MAX_SIGNERS)return null;
  const signers=[];
  for(const item of list){
    const roleTitle=clean(item?.role_title),signerName=clean(item?.signer_name);
    if(!within(roleTitle,30)||[...signerName].length>30)return null;
    signers.push({roleTitle,signerName});
  }
  return signers;
}
export function validateStrokes(value){
  if(!Array.isArray(value)||value.length<1||value.length>MAX_STROKES)return null;
  let points=0;const out=[];
  for(const stroke of value){
    if(!Array.isArray(stroke)||stroke.length<1)return null;
    const s=[];
    for(const point of stroke){
      if(!Array.isArray(point)||point.length!==2)return null;
      const [x,y]=point;
      if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>1000||y<0||y>400)return null;
      s.push([x,y]);
    }
    points+=s.length;
    if(points>MAX_POINTS)return null;
    out.push(s);
  }
  return points>=MIN_POINTS?out:null;
}
// Records-only (보관) documents may also be office/HWP originals; they are downloaded, never rendered.
const ZIP=[0x50,0x4b,0x03,0x04],OLE=[0xd0,0xcf,0x11,0xe0];
const ARCHIVE_TYPES=Object.freeze({
  hwp:{mime:'application/x-hwp',magic:OLE},
  hwpx:{mime:'application/hwp+zip',magic:ZIP},
  docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',magic:ZIP},
  xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',magic:ZIP},
  pptx:{mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',magic:ZIP},
});
const EXT_MIME=Object.freeze({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'});
const hasMagic=(bytes,magic)=>bytes.length>=magic.length&&magic.every((b,i)=>bytes[i]===b);
export function sniffFileType(bytes,declared,{fileName='',archive=false}={}){
  const mime=String(declared||'').toLowerCase().split(';')[0].trim();
  const ext=(String(fileName).toLowerCase().match(/\.([a-z0-9]{2,5})$/)||[])[1]||'';
  const viewable=FILE_TYPES[mime]?mime:EXT_MIME[ext];
  if(viewable&&hasMagic(bytes,FILE_TYPES[viewable].magic))return {mime:viewable,ext:FILE_TYPES[viewable].ext};
  const office=archive&&ARCHIVE_TYPES[ext];
  if(office&&hasMagic(bytes,office.magic))return {mime:office.mime,ext};
  return null;
}
export function nextSignerState(signers,seq){
  // Pure model of one signing step: returns the new signer statuses and document status.
  const count=signers.length,isLast=seq===count;
  return {
    signers:signers.map(s=>s.seq===seq?{...s,status:'signed'}:s.seq===seq+1&&s.status==='waiting'?{...s,status:'active'}:s),
    status:isLast?'completed':'in_progress',currentSeq:isLast?seq:seq+1,isLast,
  };
}

// ---------- persistence helpers ----------
const bucket=env=>env?.CGMA_EDOC_FILES||env?.LIVE_RECORDINGS_BUCKET||null;
async function lastEventHash(env,docId){
  const row=await env.DB.prepare('SELECT event_hash FROM cgma_edoc_events WHERE doc_id=? ORDER BY rowid DESC LIMIT 1').bind(docId).first();
  return row?.event_hash||'';
}
export async function eventHash({prevHash,docId,action,actor,detailJson,createdAt}){
  return sha256Hex([prevHash,docId,action,actor,detailJson,createdAt].join('\n'));
}
// Guards make an event (and dependent statements) conditional on the state change in the same batch
// having actually happened, so a refused operation never leaves a false audit record.
const signatureGuard=(docId,seq,signatureId)=>({sql:'EXISTS (SELECT 1 FROM cgma_edoc_signers WHERE doc_id=? AND seq=? AND signature_id=?)',binds:[docId,seq,signatureId]});
const nonceGuard=(docId,nonce)=>({sql:'EXISTS (SELECT 1 FROM cgma_edoc_documents WHERE id=? AND op_nonce=?)',binds:[docId,nonce]});
const tokenGuard=(docId,seq,tokenHash)=>({sql:'EXISTS (SELECT 1 FROM cgma_edoc_signers WHERE doc_id=? AND seq=? AND token_hash=?)',binds:[docId,seq,tokenHash]});
async function eventStatement(env,{docId,action,actor,detail={},createdAt,prevHash,guard=null}){
  const detailJson=JSON.stringify(detail);
  const hash=await eventHash({prevHash,docId,action,actor,detailJson,createdAt});
  const id=crypto.randomUUID();
  const statement=guard
    ?env.DB.prepare(`INSERT INTO cgma_edoc_events (id,doc_id,action,actor,detail_json,prev_hash,event_hash,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE ${guard.sql}`)
      .bind(id,docId,action,actor,detailJson,prevHash,hash,createdAt,...guard.binds)
    :env.DB.prepare('INSERT INTO cgma_edoc_events (id,doc_id,action,actor,detail_json,prev_hash,event_hash,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id,docId,action,actor,detailJson,prevHash,hash,createdAt);
  return {statement,hash};
}
// The (doc_id, prev_hash) unique index lets only one writer extend the chain from a given event. A batch
// that loses the race is rolled back atomically by D1; rebuild it on the new chain head and retry.
const isChainConflict=error=>/UNIQUE/i.test(String(error?.message||''))&&/prev_hash|idx_cgma_edoc_events_chain/i.test(String(error?.message||''));
export async function chainedBatch(env,docId,build,attempts=5){
  for(let attempt=1;;attempt++){
    const statements=await build(await lastEventHash(env,docId));
    try{return await env.DB.batch(statements);}
    catch(error){if(!isChainConflict(error)||attempt>=attempts)throw error;}
  }
}
async function loadDocument(env,id){
  return env.DB.prepare('SELECT * FROM cgma_edoc_documents WHERE id=? AND workspace_id=? LIMIT 1').bind(id,EDOC_TENANT).first();
}
async function loadSigners(env,docId){
  const result=await env.DB.prepare('SELECT * FROM cgma_edoc_signers WHERE doc_id=? ORDER BY seq').bind(docId).all();
  return result?.results||[];
}
const parseStrokes=value=>{try{const v=JSON.parse(value||'[]');return Array.isArray(v)?v:[]}catch{return []}};
function publicDocument(doc){
  return {id:doc.id,doc_no:doc.doc_no,title:doc.title,category:doc.category,summary:doc.summary,content_kind:doc.content_kind,
    body_text:doc.content_kind==='text'?doc.body_text:'',file_name:doc.file_name,file_mime:doc.file_mime,file_size:Number(doc.file_size||0),
    content_sha256:doc.content_sha256,status:doc.status,current_seq:Number(doc.current_seq||0),signer_count:Number(doc.signer_count||0),
    created_at:doc.created_at,started_at:doc.started_at,completed_at:doc.completed_at,cancelled_at:doc.cancelled_at,cancel_reason:doc.cancel_reason,
    mode:doc.mode||'sign',doc_date:doc.doc_date||'',source_note:doc.source_note||'',serial_no:doc.serial_no==null?null:Number(doc.serial_no),
    archived:(doc.mode||'sign')==='archive'&&doc.status==='completed'};
}
function publicSigner(s,{withLink=false,doc=null,now=Date.now()}={}){
  const out={seq:Number(s.seq),role_title:s.role_title,signer_name:s.signer_name,status:s.status,signed_at:s.signed_at,
    signed_name:s.signed_name,signature:s.status==='signed'?parseStrokes(s.signature_strokes):[],signed_content_sha256:s.signed_content_sha256};
  if(withLink&&doc?.status==='in_progress'&&s.status!=='signed'&&s.link_token){
    out.link=signLink(s.link_token);
    out.link_expires_at=s.token_expires_at;
    out.link_expired=Date.parse(s.token_expires_at||0)<=now;
  }
  return out;
}
async function nextDocNo(env,now){
  const year=new Date(now+9*3600*1000).getUTCFullYear();
  const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM cgma_edoc_documents WHERE workspace_id=? AND doc_no LIKE ?").bind(EDOC_TENANT,`CGMA-${year}-%`).first();
  return {year,n:Number(row?.n||0)+1};
}

// ---------- administrator ----------
async function requireAdmin(request,env,resolveAuthority){
  const authority=await resolveAuthority(request,env,{tenantSlug:EDOC_TENANT});
  if(!authority?.ok){
    const status=authority?.status===401?401:403;
    return {response:fail(status===401?'ADMIN_LOGIN_REQUIRED':'ADMIN_FORBIDDEN',
      status===401?'청계면상인회 관리자 로그인이 필요합니다.':'청계면상인회 전자문서 관리 권한이 없습니다.',status)};
  }
  if(!['platform','tenant','tenant-delegated'].includes(authority.scope))return {response:fail('ADMIN_FORBIDDEN','청계면상인회 전자문서 관리 권한이 없습니다.',403)};
  return {authority,actor:'admin:'+String(authority.email||'').toLowerCase()};
}

async function listDocuments(request,env){
  const url=new URL(request.url);
  const status=url.searchParams.get('status')||'';
  const q=clean(url.searchParams.get('q')||'').slice(0,60);
  const year=/^\d{4}$/.test(url.searchParams.get('year')||'')?url.searchParams.get('year'):'';
  const where=['1=1'],binds=[EDOC_TENANT];
  if(status==='archived'){where.push("status='completed' AND mode='archive'");}
  else if(status==='completed'){where.push("status='completed' AND mode<>'archive'");}
  else if(['draft','in_progress','cancelled'].includes(status)){where.push('status=?');binds.push(status);}
  if(year){where.push('doc_no LIKE ?');binds.push(`CGMA-${year}-%`);}
  if(q){where.push('(title LIKE ? OR doc_no LIKE ? OR category LIKE ? OR summary LIKE ?)');const like=`%${q.replace(/[%_]/g,'')}%`;binds.push(like,like,like,like);}
  // 연번: a stable serial number in registration order across the whole register (filters do not renumber).
  const result=await env.DB.prepare(`SELECT * FROM (SELECT d.*,ROW_NUMBER() OVER (ORDER BY d.created_at,d.id) AS serial_no
      FROM cgma_edoc_documents d WHERE d.workspace_id=?) WHERE ${where.join(' AND ')} ORDER BY serial_no DESC LIMIT 300`).bind(...binds).all();
  const docs=(result?.results||[]).map(publicDocument);
  const counts=await env.DB.prepare("SELECT CASE WHEN status='completed' AND mode='archive' THEN 'archived' ELSE status END AS bucket,COUNT(*) AS n FROM cgma_edoc_documents WHERE workspace_id=? GROUP BY bucket").bind(EDOC_TENANT).all();
  const summary={draft:0,in_progress:0,completed:0,archived:0,cancelled:0};
  for(const row of counts?.results||[])summary[row.bucket]=Number(row.n||0);
  return json({ok:true,documents:docs,summary,categories:EDOC_CATEGORIES,default_roles:DEFAULT_SIGNER_ROLES});
}

async function createDocument(request,env,{actor,now}){
  const parsed=await readJson(request);
  if(parsed.invalidType)return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  if(parsed.tooLarge)return fail('TOO_LARGE','요청 크기가 너무 큽니다.',413);
  const v=validateDraft(parsed.value);
  if(!v.ok)return fail(v.code,'입력 내용을 확인해 주세요.');
  const d=v.value,id=crypto.randomUUID(),stamp=new Date(now).toISOString();
  const contentSha=d.contentKind==='text'?await sha256Hex(d.bodyText):'';
  for(let attempt=0;attempt<3;attempt++){
    const {year,n}=await nextDocNo(env,now);
    const docNo=`CGMA-${year}-${String(n+attempt).padStart(4,'0')}`;
    const {statement:event}=await eventStatement(env,{docId:id,action:'created',actor,createdAt:stamp,prevHash:'',
      detail:{doc_no:docNo,title:d.title,category:d.category,content_kind:d.contentKind,mode:d.mode,doc_date:d.docDate,signers:d.signers.map(s=>`${s.roleTitle} ${s.signerName}`.trim())}});
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO cgma_edoc_documents (id,workspace_id,doc_no,title,category,summary,content_kind,body_text,content_sha256,status,current_seq,signer_count,created_by,created_at,updated_at,mode,doc_date,source_note)
          VALUES (?,?,?,?,?,?,?,?,?,'draft',0,?,?,?,?,?,?,?)`)
          .bind(id,EDOC_TENANT,docNo,d.title,d.category,d.summary,d.contentKind,d.bodyText,contentSha,d.signers.length,actor,stamp,stamp,d.mode,d.docDate,d.sourceNote),
        ...d.signers.map((s,i)=>env.DB.prepare(`INSERT INTO cgma_edoc_signers (doc_id,seq,role_title,signer_name,status,created_at,updated_at) VALUES (?,?,?,?,'waiting',?,?)`)
          .bind(id,i+1,s.roleTitle,s.signerName,stamp,stamp)),
        event,
      ]);
      return json({ok:true,id,doc_no:docNo},201);
    }catch(error){
      if(!/UNIQUE/i.test(String(error?.message||'')))throw error;
    }
  }
  return fail('DOC_NO_CONFLICT','문서번호를 발급하지 못했습니다. 다시 시도해 주세요.',409);
}

async function uploadFile(request,env,{doc,actor,now}){
  if(doc.status!=='draft')return fail('DOCUMENT_LOCKED','서명 요청이 시작된 문서의 원본은 바꿀 수 없습니다.',409);
  if(doc.content_kind!=='file')return fail('CONTENT_KIND_MISMATCH','본문형 문서에는 파일을 올릴 수 없습니다.',409);
  const store=bucket(env);
  if(!store?.put)return fail('FILE_STORAGE_UNAVAILABLE','파일 저장소를 사용할 수 없습니다.',503);
  const body=await readBody(request,MAX_FILE_BYTES);
  if(body.tooLarge)return fail('FILE_TOO_LARGE','파일은 20MB 이하만 올릴 수 있습니다.',413);
  let name='';try{name=clean(decodeURIComponent(request.headers.get('x-ekodi-file-name')||''))}catch{}
  const archive=(doc.mode||'sign')==='archive';
  const type=sniffFileType(body.bytes,request.headers.get('content-type'),{fileName:name,archive});
  if(!type)return fail('FILE_TYPE_INVALID',archive?'PDF, 이미지(PNG·JPEG), 한글(HWP·HWPX), 워드·엑셀·파워포인트 파일만 올릴 수 있습니다.':'서명용 문서는 PDF, PNG, JPEG 파일만 올릴 수 있습니다.',415);
  name=(name.replace(/[\\/]/g,'_').slice(0,120))||`document.${type.ext}`;
  const sha=await sha256Hex(body.bytes);
  const key=`cgma/edocs/${doc.id}/original-${sha.slice(0,16)}.${type.ext}`;
  await store.put(key,body.bytes,{httpMetadata:{contentType:type.mime},customMetadata:{sha256:sha,doc_id:doc.id,workspace:EDOC_TENANT}});
  const stamp=new Date(now).toISOString(),nonce=crypto.randomUUID();
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'file_uploaded',actor,createdAt:stamp,prevHash,guard:nonceGuard(doc.id,nonce),
      detail:{file_name:name,size:body.bytes.length,mime:type.mime,sha256:sha}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_documents SET file_key=?,file_name=?,file_mime=?,file_size=?,content_sha256=?,op_nonce=?,updated_at=? WHERE id=? AND status='draft'`)
        .bind(key,name,type.mime,body.bytes.length,sha,nonce,stamp,doc.id),
      event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1){
    // Lost a race with start: remove the object unless it is (by identical content) the document's file.
    const current=await loadDocument(env,doc.id).catch(()=>null);
    if(current?.file_key!==key)await store.delete?.(key)?.catch?.(()=>{});
    return fail('DOCUMENT_LOCKED','서명 요청이 시작된 문서의 원본은 바꿀 수 없습니다.',409);
  }
  return json({ok:true,content_sha256:sha,file_name:name,file_size:body.bytes.length});
}

async function startDocument(env,{doc,actor,now}){
  if(doc.status!=='draft')return fail('ALREADY_STARTED','이미 서명 요청이 시작된 문서입니다.',409);
  if((doc.mode||'sign')==='archive')return fail('ARCHIVE_DOCUMENT','보관 문서는 서명 요청 없이 ‘보관 확정’으로 등록합니다.',409);
  if(!doc.content_sha256)return fail('CONTENT_REQUIRED','원본 파일 또는 본문을 먼저 등록해 주세요.',409);
  const signers=await loadSigners(env,doc.id);
  if(!signers.length)return fail('SIGNERS_INVALID','서명자가 없습니다.',409);
  const unnamed=signers.filter(s=>!String(s.signer_name||'').trim()).map(s=>s.role_title);
  if(unnamed.length)return fail('SIGNER_NAMES_REQUIRED',`서명자 성명을 먼저 입력해 주세요: ${unnamed.join(', ')}`,409);
  const stamp=new Date(now).toISOString(),expires=new Date(now+LINK_TTL_MS).toISOString(),nonce=crypto.randomUUID();
  const guard=nonceGuard(doc.id,nonce);
  const tokens=[];
  const signerStatements=[];
  for(const s of signers){
    const token=newSignToken();tokens.push(token);
    // Conditional on this batch's own draft→in_progress transition: a second (double-click) start is a no-op.
    signerStatements.push(env.DB.prepare(`UPDATE cgma_edoc_signers SET status=?,link_token=?,token_hash=?,token_expires_at=?,updated_at=? WHERE doc_id=? AND seq=? AND ${guard.sql}`)
      .bind(Number(s.seq)===1?'active':'waiting',token,await sha256Hex(token),expires,stamp,doc.id,s.seq,...guard.binds));
  }
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'started',actor,createdAt:stamp,prevHash,guard,
      detail:{content_sha256:doc.content_sha256,order:signers.map(s=>`${s.seq}. ${s.role_title} ${s.signer_name}`),links_expire_at:expires}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_documents SET status='in_progress',current_seq=1,started_at=?,op_nonce=?,updated_at=? WHERE id=? AND status='draft' AND content_sha256<>''`).bind(stamp,nonce,stamp,doc.id),
      ...signerStatements,event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('ALREADY_STARTED','이미 서명 요청이 시작된 문서입니다.',409);
  return json({ok:true,status:'in_progress',links:signers.map((s,i)=>({seq:Number(s.seq),role_title:s.role_title,signer_name:s.signer_name,link:signLink(tokens[i])}))});
}

async function cancelDocument(request,env,{doc,actor,now}){
  if(!['draft','in_progress'].includes(doc.status))return fail('NOT_CANCELLABLE','완료되었거나 이미 취소된 문서는 취소할 수 없습니다.',409);
  const parsed=await readJson(request);
  if(parsed.invalidType)return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  const reason=clean(parsed.value?.reason);
  if(!within(reason,300))return fail('REASON_REQUIRED','취소 사유를 입력해 주세요.');
  const stamp=new Date(now).toISOString(),nonce=crypto.randomUUID(),guard=nonceGuard(doc.id,nonce);
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'cancelled',actor,createdAt:stamp,prevHash,guard,detail:{reason}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_documents SET status='cancelled',cancelled_at=?,cancel_reason=?,op_nonce=?,updated_at=? WHERE id=? AND status IN ('draft','in_progress')`).bind(stamp,reason,nonce,stamp,doc.id),
      env.DB.prepare(`UPDATE cgma_edoc_signers SET link_token='',token_hash='',updated_at=? WHERE doc_id=? AND status<>'signed' AND ${guard.sql}`).bind(stamp,doc.id,...guard.binds),
      event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('NOT_CANCELLABLE','완료되었거나 이미 취소된 문서는 취소할 수 없습니다.',409);
  return json({ok:true,status:'cancelled'});
}

async function reissueLink(env,{doc,seq,actor,now}){
  if(doc.status!=='in_progress')return fail('NOT_IN_PROGRESS','서명 진행 중인 문서만 링크를 다시 발급할 수 있습니다.',409);
  const signer=await env.DB.prepare('SELECT * FROM cgma_edoc_signers WHERE doc_id=? AND seq=? LIMIT 1').bind(doc.id,seq).first();
  if(!signer)return fail('SIGNER_NOT_FOUND','서명자를 찾을 수 없습니다.',404);
  if(signer.status==='signed')return fail('ALREADY_SIGNED','이미 서명한 서명자입니다.',409);
  const token=newSignToken(),stamp=new Date(now).toISOString(),expires=new Date(now+LINK_TTL_MS).toISOString();
  const tokenHash=await sha256Hex(token);
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'link_reissued',actor,createdAt:stamp,prevHash,guard:tokenGuard(doc.id,seq,tokenHash),
      detail:{seq,role_title:signer.role_title,links_expire_at:expires}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_signers SET link_token=?,token_hash=?,token_expires_at=?,updated_at=? WHERE doc_id=? AND seq=? AND status<>'signed'
          AND EXISTS (SELECT 1 FROM cgma_edoc_documents WHERE id=? AND status='in_progress')`)
        .bind(token,tokenHash,expires,stamp,doc.id,seq,doc.id),
      event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('ALREADY_SIGNED','이미 서명한 서명자입니다.',409);
  return json({ok:true,seq,link:signLink(token),link_expires_at:expires});
}

// 보관 확정: a records-only document becomes a permanent completed record (no signatures involved).
async function archiveDocument(env,{doc,actor,now}){
  if((doc.mode||'sign')!=='archive')return fail('NOT_ARCHIVE_DOCUMENT','서명 문서는 서명 요청으로 진행합니다.',409);
  if(doc.status!=='draft')return fail('ALREADY_FINALIZED','이미 보관 확정된 문서입니다.',409);
  if(!doc.content_sha256)return fail('CONTENT_REQUIRED','원본 파일 또는 본문을 먼저 등록해 주세요.',409);
  const stamp=new Date(now).toISOString(),nonce=crypto.randomUUID(),guard=nonceGuard(doc.id,nonce);
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'archived',actor,createdAt:stamp,prevHash,guard,
      detail:{content_sha256:doc.content_sha256,file_name:doc.file_name,doc_date:doc.doc_date||''}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_documents SET status='completed',completed_at=?,op_nonce=?,updated_at=? WHERE id=? AND status='draft' AND mode='archive' AND content_sha256<>''`).bind(stamp,nonce,stamp,doc.id),
      event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('ALREADY_FINALIZED','이미 보관 확정된 문서입니다.',409);
  return json({ok:true,status:'completed',archived:true});
}

// Draft signer plan edit (names can be completed before the request starts; order is left → right).
async function updateSigners(request,env,{doc,actor,now}){
  if(doc.status!=='draft'||(doc.mode||'sign')!=='sign')return fail('DOCUMENT_LOCKED','서명 요청 전 초안에서만 서명자를 바꿀 수 있습니다.',409);
  const parsed=await readJson(request);
  if(parsed.invalidType)return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  const signers=validateSigners(parsed.value?.signers);
  if(!signers)return fail('SIGNERS_INVALID','서명자 직책과 순서를 확인해 주세요.');
  const stamp=new Date(now).toISOString(),nonce=crypto.randomUUID(),guard=nonceGuard(doc.id,nonce);
  const results=await chainedBatch(env,doc.id,async prevHash=>{
    const {statement:event}=await eventStatement(env,{docId:doc.id,action:'signers_updated',actor,createdAt:stamp,prevHash,guard,
      detail:{order:signers.map((s,i)=>`${i+1}. ${s.roleTitle} ${s.signerName}`.trim())}});
    return [
      env.DB.prepare(`UPDATE cgma_edoc_documents SET signer_count=?,op_nonce=?,updated_at=? WHERE id=? AND status='draft' AND mode='sign'`).bind(signers.length,nonce,stamp,doc.id),
      env.DB.prepare(`DELETE FROM cgma_edoc_signers WHERE doc_id=? AND ${guard.sql}`).bind(doc.id,...guard.binds),
      ...signers.map((s,i)=>env.DB.prepare(`INSERT INTO cgma_edoc_signers (doc_id,seq,role_title,signer_name,status,created_at,updated_at) SELECT ?,?,?,?,'waiting',?,? WHERE ${guard.sql}`)
        .bind(doc.id,i+1,s.roleTitle,s.signerName,stamp,stamp,...guard.binds)),
      event,
    ];
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('DOCUMENT_LOCKED','서명 요청 전 초안에서만 서명자를 바꿀 수 있습니다.',409);
  return json({ok:true,signer_count:signers.length});
}

async function documentDetail(env,{doc,now}){
  const signers=await loadSigners(env,doc.id);
  const events=await env.DB.prepare('SELECT action,actor,detail_json,prev_hash,event_hash,created_at FROM cgma_edoc_events WHERE doc_id=? ORDER BY rowid').bind(doc.id).all();
  const list=(events?.results||[]).map(e=>({action:e.action,actor:e.actor,detail:(()=>{try{return JSON.parse(e.detail_json)}catch{return {}}})(),prev_hash:e.prev_hash,event_hash:e.event_hash,created_at:e.created_at}));
  let chainValid=true;
  for(let i=0;i<list.length;i++){
    const e=list[i],expected=i?list[i-1].event_hash:'';
    if(e.prev_hash!==expected||e.event_hash!==await eventHash({prevHash:e.prev_hash,docId:doc.id,action:e.action,actor:e.actor,detailJson:JSON.stringify(e.detail),createdAt:e.created_at}))chainValid=false;
  }
  return json({ok:true,document:publicDocument(doc),signers:signers.map(s=>publicSigner(s,{withLink:true,doc,now})),events:list,chain_valid:chainValid,sign_page:SIGN_PAGE_URL});
}

async function streamFile(env,doc){
  if(doc.content_kind!=='file'||!doc.file_key)return fail('FILE_NOT_FOUND','원본 파일이 없습니다.',404);
  const store=bucket(env);
  if(!store?.get)return fail('FILE_STORAGE_UNAVAILABLE','파일 저장소를 사용할 수 없습니다.',503);
  const object=await store.get(doc.file_key);
  if(!object)return fail('FILE_NOT_FOUND','원본 파일이 없습니다.',404);
  return new Response(object.body,{status:200,headers:{
    'content-type':doc.file_mime||'application/octet-stream',
    'content-disposition':`inline; filename*=UTF-8''${encodeURIComponent(doc.file_name||'document')}`,
    'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
    'x-ekodi-route':'cgma-edocs','x-ekodi-content-sha256':doc.content_sha256,
  }});
}

// ---------- signer ----------
async function signerContext(request,env,now){
  const token=String(request.headers.get('x-ekodi-sign-token')||'').trim();
  if(!isToken(token))return {response:fail('SIGN_LINK_INVALID','서명 링크가 올바르지 않습니다.',401)};
  const signer=await env.DB.prepare('SELECT * FROM cgma_edoc_signers WHERE token_hash=? LIMIT 1').bind(await sha256Hex(token)).first();
  if(!signer)return {response:fail('SIGN_LINK_INVALID','서명 링크가 올바르지 않거나 다시 발급되었습니다. 관리자에게 새 링크를 요청해 주세요.',401)};
  const doc=await loadDocument(env,signer.doc_id);
  if(!doc)return {response:fail('SIGN_LINK_INVALID','문서를 찾을 수 없습니다.',404)};
  return {signer,doc,tokenHash:signer.token_hash,expired:Date.parse(signer.token_expires_at||0)<=now};
}
async function signerView(env,{signer,doc,expired}){
  const signers=await loadSigners(env,doc.id);
  const active=signers.find(s=>s.status==='active');
  const canSign=doc.status==='in_progress'&&signer.status==='active'&&!expired;
  return json({ok:true,document:publicDocument(doc),signers:signers.map(s=>publicSigner(s)),
    me:{seq:Number(signer.seq),role_title:signer.role_title,signer_name:signer.signer_name,status:signer.status,signed_at:signer.signed_at},
    can_sign:canSign,link_expired:expired&&signer.status!=='signed',
    waiting_for:signer.status==='waiting'&&active?{seq:Number(active.seq),role_title:active.role_title,signer_name:active.signer_name}:null});
}
async function submitSignature(request,env,{signer,doc,tokenHash,expired,now}){
  if(doc.status==='completed')return fail('ALREADY_COMPLETED','이미 모든 서명이 끝난 문서입니다.',409);
  if(doc.status!=='in_progress')return fail('NOT_IN_PROGRESS','서명할 수 없는 문서입니다(취소 또는 준비 중).',409);
  if(signer.status==='signed')return fail('ALREADY_SIGNED','이미 서명하셨습니다.',409);
  if(expired)return fail('SIGN_LINK_EXPIRED','서명 링크 유효기간이 지났습니다. 관리자에게 새 링크를 요청해 주세요.',410);
  if(signer.status!=='active'){
    const active=await env.DB.prepare("SELECT role_title,signer_name FROM cgma_edoc_signers WHERE doc_id=? AND status='active' LIMIT 1").bind(doc.id).first();
    return fail('SIGN_NOT_YOUR_TURN',active?`앞 순서(${active.role_title} ${active.signer_name})의 서명이 끝난 뒤 서명할 수 있습니다.`:'아직 서명 순서가 아닙니다.',409);
  }
  const parsed=await readJson(request);
  if(parsed.invalidType)return fail('CONTENT_TYPE_INVALID','JSON 요청만 허용됩니다.',415);
  if(parsed.tooLarge)return fail('TOO_LARGE','서명 데이터가 너무 큽니다.',413);
  const body=parsed.value||{};
  if(body.agree!==true)return fail('AGREEMENT_REQUIRED','문서 내용을 확인했다는 동의가 필요합니다.');
  if(String(body.content_sha256||'')!==doc.content_sha256)return fail('CONTENT_CHANGED','확인하신 문서와 현재 문서가 다릅니다. 새로고침 후 다시 확인해 주세요.',409);
  const signedName=clean(body.signed_name);
  if(!within(signedName,30)||normalizeName(signedName)!==normalizeName(signer.signer_name))return fail('NAME_MISMATCH',`지정된 서명자 성명(${signer.signer_name})과 같게 입력해 주세요.`,422);
  const strokes=validateStrokes(body.signature);
  if(!strokes)return fail('SIGNATURE_INVALID','서명을 그려 주세요.',422);
  const seq=Number(signer.seq),count=Number(doc.signer_count),isLast=seq===count;
  const stamp=new Date(now).toISOString(),signatureId=crypto.randomUUID();
  const clientHash=await sha256Hex(`cgma-edoc|${doc.id}|${clientAddress(request)}`);
  const ua=clean(request.headers.get('user-agent')||'').slice(0,200);
  const guard=signatureGuard(doc.id,seq,signatureId);
  const results=await chainedBatch(env,doc.id,async prevHash=>{
  const signedEvent=await eventStatement(env,{docId:doc.id,action:'signed',actor:`signer:${seq}`,createdAt:stamp,prevHash,guard,
    detail:{seq,role_title:signer.role_title,signer_name:signer.signer_name,signed_name:signedName,content_sha256:doc.content_sha256,signature_id:signatureId,client_hash:clientHash}});
  const statements=[
    env.DB.prepare(`UPDATE cgma_edoc_signers SET status='signed',signed_at=?,signed_name=?,signature_strokes=?,signed_content_sha256=?,signature_id=?,client_hash=?,user_agent=?,link_token='',updated_at=?
        WHERE doc_id=? AND seq=? AND status='active' AND token_hash=?
        AND EXISTS (SELECT 1 FROM cgma_edoc_documents WHERE id=? AND status='in_progress' AND content_sha256=?)`)
      .bind(stamp,signedName,JSON.stringify(strokes),doc.content_sha256,signatureId,clientHash,ua,stamp,doc.id,seq,tokenHash,doc.id,doc.content_sha256),
    env.DB.prepare(`UPDATE cgma_edoc_signers SET status='active',updated_at=? WHERE doc_id=? AND seq=? AND status='waiting'
        AND EXISTS (SELECT 1 FROM cgma_edoc_signers WHERE doc_id=? AND seq=? AND signature_id=?)`)
      .bind(stamp,doc.id,seq+1,doc.id,seq,signatureId),
    env.DB.prepare(`UPDATE cgma_edoc_documents SET status=?,current_seq=?,completed_at=?,updated_at=? WHERE id=? AND status='in_progress'
        AND EXISTS (SELECT 1 FROM cgma_edoc_signers WHERE doc_id=? AND seq=? AND signature_id=?)`)
      .bind(isLast?'completed':'in_progress',isLast?seq:seq+1,isLast?stamp:'',stamp,doc.id,doc.id,seq,signatureId),
    signedEvent.statement,
  ];
  if(isLast){
    const completed=await eventStatement(env,{docId:doc.id,action:'completed',actor:'system',createdAt:stamp,prevHash:signedEvent.hash,guard,
      detail:{content_sha256:doc.content_sha256,signer_count:count}});
    statements.push(completed.statement);
  }
  return statements;
  });
  if(Number(results?.[0]?.meta?.changes||0)!==1)return fail('SIGN_CONFLICT','서명 상태가 바뀌었습니다. 새로고침 후 확인해 주세요.',409);
  return json({ok:true,signed_at:stamp,completed:isLast,next:isLast?null:{seq:seq+1}});
}

// ---------- entry ----------
export function isEdocApiPath(pathname){return pathname===EDOC_API_PREFIX||pathname.startsWith(EDOC_API_PREFIX+'/');}

export async function handleCgmaEdocs(request,env,options={}){
  const url=new URL(request.url);
  if(!isEdocApiPath(url.pathname))return null;
  if(!env?.DB)return fail('STORAGE_UNAVAILABLE','전자문서 저장소를 사용할 수 없습니다.',503);
  const now=typeof options.now==='function'?options.now():Date.now();
  const resolveAuthority=options.resolveAuthority||resolveTenantAccessAuthority;
  const sub=url.pathname.slice(EDOC_API_PREFIX.length).replace(/\/+$/,'')||'/';
  const method=request.method;
  const write=!['GET','HEAD'].includes(method);
  try{
    if(write&&!sameOriginWrite(request))return fail('ORIGIN_FORBIDDEN','허용되지 않은 요청 출처입니다.',403);
    // Signer surface (link possession).
    if(sub==='/sign'||sub==='/sign/file'){
      const ctx=await signerContext(request,env,now);
      if(ctx.response)return ctx.response;
      if(sub==='/sign/file'&&method==='GET')return streamFile(env,ctx.doc);
      if(sub==='/sign'&&method==='GET')return signerView(env,ctx);
      if(sub==='/sign'&&method==='POST')return submitSignature(request,env,{...ctx,now});
      return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405);
    }
    // Administrator surface.
    const admin=await requireAdmin(request,env,resolveAuthority);
    if(admin.response)return admin.response;
    const {actor}=admin;
    if(sub==='/'){
      if(method==='GET')return listDocuments(request,env);
      if(method==='POST')return createDocument(request,env,{actor,now});
      return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405);
    }
    const match=sub.match(/^\/([0-9a-f-]{36})(\/file|\/start|\/cancel|\/archive|\/signers|\/signers\/(\d{1,2})\/reissue)?$/);
    if(!match)return fail('NOT_FOUND','요청한 기능이 없습니다.',404);
    const doc=await loadDocument(env,match[1]);
    if(!doc)return fail('DOCUMENT_NOT_FOUND','문서를 찾을 수 없습니다.',404);
    const action=match[2]||'';
    if(!action&&method==='GET')return documentDetail(env,{doc,now});
    if(action==='/file'&&method==='GET')return streamFile(env,doc);
    if(action==='/file'&&method==='PUT')return uploadFile(request,env,{doc,actor,now});
    if(action==='/start'&&method==='POST')return startDocument(env,{doc,actor,now});
    if(action==='/cancel'&&method==='POST')return cancelDocument(request,env,{doc,actor,now});
    if(action==='/archive'&&method==='POST')return archiveDocument(env,{doc,actor,now});
    if(action==='/signers'&&method==='PUT')return updateSigners(request,env,{doc,actor,now});
    if(match[3]&&method==='POST')return reissueLink(env,{doc,seq:Number(match[3]),actor,now});
    return fail('METHOD_NOT_ALLOWED','허용되지 않은 요청입니다.',405);
  }catch(error){
    // Never log request bodies, signer names or signatures: error class only.
    console.error('[cgma-edocs] operation failed',error?.name||'Error');
    return fail('UNAVAILABLE','일시적인 오류로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',503);
  }
}
