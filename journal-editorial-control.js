// Private EKODI Journal editorial drafts. Never publishes a public article.
import { handleAdminSessionFastPath } from './admin-session-fastpath.js';
import { getPost } from './journal-content.js';
import { createJournalReviewPacket, journalBodyToText } from './journal-editorial-packet.js';

const ROOT = '/api/journal/editorial/drafts';
const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
    'x-robots-tag':'noindex, nofollow, noarchive',
  },
});
const fail = (code, status) => json({ok:false,error:code},status);
const digest = async input => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const publicSummary = row => ({
  slug:row.slug,
  revision:Number(row.revision),
  sourceRevision:row.source_revision||null,
  updatedAt:row.updated_at,
  // Private editorial metadata; returned only after strict central super-admin verification.
  title:JSON.parse(row.packet_json).article.title,
  state:'review_required',
});

export async function verifyJournalSuperAdmin(request,env) {
  // The identity comes only from the existing EKODI central D1 session verifier.
  const sessionUrl=new URL(request.url);
  sessionUrl.pathname='/api/session';
  sessionUrl.search='';
  const headers=new Headers();
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [^\s]{1,256}$/.test(authorization))return null;
  headers.set('authorization',authorization);
  const origin=request.headers.get('origin');
  if(origin)headers.set('origin',origin);
  const sessionResponse=await handleAdminSessionFastPath(new Request(sessionUrl,{method:'GET',headers}),env);
  if(!sessionResponse?.ok)return null;
  const session=await sessionResponse.json().catch(()=>null);
  return session?.authenticated===true && session?.role==='super_admin' && typeof session.email==='string'
    ? session : null;
}
const draftDetail = row => ({
  ...publicSummary(row),
  packet:JSON.parse(row.packet_json),
});
async function load(env,slug) {
  return env.DB.prepare('SELECT slug,source_revision,packet_json,revision,updated_at FROM journal_private_editorial_drafts WHERE slug=?')
    .bind(slug).first();
}

export async function handleJournalEditorialDrafts(request,env){
  const url=new URL(request.url);
  const path=url.pathname;
  if(path!==ROOT&&!path.startsWith(ROOT+'/'))return null;
  const suffix=path.slice(ROOT.length);
  const slug=suffix.startsWith('/')?suffix.slice(1):'';
  if(suffix && (!slug || !SLUG.test(slug)))return fail('invalid_slug',400);
  if(!['GET','POST'].includes(request.method))return fail('method_not_allowed',405);
  if(request.method==='POST'&&suffix)return fail('method_not_allowed',405);
  if(request.method==='POST'){
    const origin=request.headers.get('origin');
    // A browser write must originate from the EKODI first-party Admin shell.
    if(origin!=='https://ekodi.kr')return fail('origin_forbidden',403);
    if(!String(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('unsupported_media_type',415);
    if(Number(request.headers.get('content-length')||0)>28000)return fail('payload_too_large',413);
  }

  let session;
  try{session=await verifyJournalSuperAdmin(request,env)}catch{return fail('authentication_unavailable',503)}
  if(!session)return fail('super_admin_required',403);
  if(!env?.DB?.prepare||!env.DB.batch)return fail('draft_storage_unavailable',503);

  try{
    if(request.method==='GET'){
      if(slug){
        const row=await load(env,slug);
        return row?json({ok:true,draft:draftDetail(row)}):fail('draft_not_found',404);
      }
      const result=await env.DB.prepare('SELECT slug,source_revision,packet_json,revision,updated_at FROM journal_private_editorial_drafts ORDER BY updated_at DESC LIMIT 100').all();
      return json({ok:true,drafts:(result.results||[]).map(publicSummary)});
    }

    const raw=await request.text().catch(()=>null);
    if(raw===null||raw.length>28000)return fail('payload_too_large',413);
    let supplied;try{supplied=JSON.parse(raw)}catch{return fail('invalid_json',400)}
    if(!supplied||typeof supplied!=='object'||Array.isArray(supplied))return fail('invalid_payload',400);
    if(!Number.isSafeInteger(supplied.expectedRevision)||supplied.expectedRevision<0)return fail('invalid_expected_revision',400);
    const article=supplied.packet?.article;
    if(supplied.packet?.schema!=='ekodi-journal-editorial-review-v1'||!article||typeof article!=='object')return fail('invalid_review_packet',400);
    const postSlug=String(article.slug||'');
    if(!SLUG.test(postSlug))return fail('invalid_slug',400);
    const source=getPost(postSlug);
    if(source&&(supplied.sourceRevision||null)!==(source.updatedAt||null))return fail('source_revision_conflict',409);
    if(!source && supplied.sourceRevision!=null)return fail('source_revision_conflict',409);
    let packet;
    try{
      packet=createJournalReviewPacket(source,{
        slug:postSlug,
        title:article.title,
        excerpt:article.excerpt,
        body:journalBodyToText(article.body),
        photoSrc:article.coverPhoto?.src||'',
        photoAlt:article.coverPhoto?.alt||'',
        photoCaption:article.coverPhoto?.caption||'',
        photoCredit:article.coverPhoto?.credit||'',
      });
    }catch{return fail('invalid_review_packet',400)}
    const packetJson=JSON.stringify(packet);
    if(packetJson.length>28000)return fail('payload_too_large',413);
    const now=new Date().toISOString();
    const requestId=crypto.randomUUID();
    const actorHash=await digest(session.email.toLowerCase().trim());
    const expected=supplied.expectedRevision;
    let mutation;
    if(expected===0){
      mutation=env.DB.prepare("INSERT INTO journal_private_editorial_drafts(slug,source_revision,packet_json,revision,request_id,updated_by_hash,created_at,updated_at) VALUES(?,?,?,1,?,?,?,?) ON CONFLICT(slug) DO NOTHING")
        .bind(postSlug,packet.sourceRevision,packetJson,requestId,actorHash,now,now);
    }else{
      mutation=env.DB.prepare("UPDATE journal_private_editorial_drafts SET source_revision=?,packet_json=?,revision=revision+1,request_id=?,updated_by_hash=?,updated_at=? WHERE slug=? AND revision=?")
        .bind(packet.sourceRevision,packetJson,requestId,actorHash,now,postSlug,expected);
    }
    const audit=env.DB.prepare("INSERT INTO journal_private_editorial_audit(request_id,slug,revision,action,actor_hash,created_at) SELECT request_id,slug,revision,'draft_saved',?,? FROM journal_private_editorial_drafts WHERE slug=? AND request_id=?")
      .bind(actorHash,now,postSlug,requestId);
    const results=await env.DB.batch([mutation,audit]);
    const changed=Number(results?.[0]?.meta?.changes||0);
    const audited=Number(results?.[1]?.meta?.changes||0);
    if(changed===0)return fail('draft_revision_conflict',409);
    if(changed!==1||audited!==1)return fail('audit_unavailable',503);
    const saved=await load(env,postSlug);
    return saved?json({ok:true,draft:draftDetail(saved)},200):fail('draft_storage_unavailable',503);
  }catch(error){
    // No SQL details, file paths or private draft text leave this control boundary.
    console.warn('[EKODI Journal] private editorial storage unavailable',error?.name||'error');
    return fail('draft_storage_unavailable',503);
  }
}
