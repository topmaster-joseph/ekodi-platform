// Publisher-owned private release administration API.
// Off by default. Only real trusted Service Binding RPC verification, not any
// body-supplied flag/approval, can authorize file registration or scheduling.
import { registerCompletedEdition, scheduleApprovedEdition, cancelUnreleasedEdition } from './scheduled-release.js';
import { readPrivateEdition, listPrivateReleaseRecords,
  savePrivateTransition, storePrivateEdition } from './private-release-store.js';

const PREFIX='/api/private-releases';
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',
  'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",
}});
const fail=(status,error)=>json({ok:false,error},status);
const enabled=env=>env?.PUBLISHING_PRIVATE_RELEASE_ENABLED==='true' &&
  env?.PUBLISHING_RELEASE_DB?.prepare &&
  typeof env?.PUBLISHING_RELEASE_AUTH?.verifyRequest==='function' &&
  typeof env?.PUBLISHING_RELEASE_VERIFIER?.loadCandidate==='function' &&
  typeof env?.PUBLISHING_RELEASE_VERIFIER?.verifyCompletedFile==='function' &&
  typeof env?.PUBLISHING_RELEASE_VERIFIER?.verifyApprovalEvidence==='function' &&
  typeof env?.PUBLISHING_RELEASE_AUDIT?.record==='function';
const safeId=id=>typeof id==='string' && ID.test(id);
const body=async request=>{
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>4096)return null;
  const raw=await request.text();
  if(raw.length>4096)return null;
  try {const obj=JSON.parse(raw);return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null;}
  catch {return null;}
};
const summary=v=>({
  editionId:v.editionId,publicationId:v.publicationId,title:v.title,
  state:v.state,visibility:v.visibility,checkoutEnabled:v.checkoutEnabled,
  releaseDigest:v.releaseDigest,publishAt:v.publishAt,revision:v.revision,
  channels:v.channels,lastTransition:v.lastTransition,
});
const now=()=>new Date().toISOString();

async function audit(env,action,subject,editionId,revision){
  // The backend audit adapter is mandatory, and must persist a journal entry
  // for the relevant revision. Missing audit receipts block confirmation.
  const receipt=await env.PUBLISHING_RELEASE_AUDIT.record({action,subject,editionId,revision});
  if(receipt?.persisted!==true)throw new Error('audit-not-persisted');
}

/**
 * Requests arrive ONLY via the publishing Worker router, never through public
 * catalogue or shop APIs. Authentication and CSRF must be verified by a
 * publisher-owned server binding, not by a role string supplied by the client.
 */
export async function handlePrivateReleaseAdmin(request,env){
  const url=new URL(request.url);
  if(!(url.pathname===PREFIX||url.pathname.startsWith(PREFIX+'/')))return null;
  if(!['GET','POST'].includes(request.method))return fail(405,'method-not-allowed');
  if(env?.PUBLISHING_PRIVATE_RELEASE_ENABLED!=='true')return fail(404,'not-found');
  if(!enabled(env))return fail(503,'private-release-service-not-configured');
  const write=request.method==='POST';
  const parts=url.pathname.slice(PREFIX.length).split('/').filter(Boolean);
  if(parts.length>2)return fail(404,'not-found');

  // All mutations require same-origin AND a *server-verified* anti-CSRF token.
  if(write) {
    if(request.headers.get('origin')!==url.origin ||
      !request.headers.get('x-ekodi-csrf') ||
      request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
      return fail(403,'origin-or-csrf-rejected');
  }
  const action=parts[0]==='register'?'register':
    parts.length===2&&['schedule','cancel'].includes(parts[1])?parts[1]:'read';
  const capability='publishing.private-release.'+action;
  let identity;
  try {
    identity=await env.PUBLISHING_RELEASE_AUTH.verifyRequest(request,{
      capability,requiresCsrf:write,origin:url.origin,
    });
  } catch {return fail(503,'authentication-unavailable');}
  if(identity?.authorized!==true || typeof identity.subjectId!=='string' ||
    identity.subjectId.length<3 || (write && identity.csrfVerified!==true))
    return fail(403,'forbidden');

  const db=env.PUBLISHING_RELEASE_DB;
  try {
    if(request.method==='GET' && parts.length===1 && parts[0]==='csrf'){
      if(typeof env.PUBLISHING_RELEASE_AUTH.issueCsrf!=='function')
        return fail(503,'csrf-service-not-configured');
      const token=await env.PUBLISHING_RELEASE_AUTH.issueCsrf({
        subjectId:identity.subjectId,capability:'publishing.private-release.schedule',
        origin:url.origin,
      });
      if(typeof token?.value!=='string' || token.value.length<32 || token.value.length>512 ||
        token.subjectId!==identity.subjectId)return fail(503,'csrf-unavailable');
      return json({ok:true,csrfToken:token.value,expiresAt:token.expiresAt||null});
    }
    if(request.method==='GET' && parts.length===0){
      const records=await listPrivateReleaseRecords(db,Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50)));
      return json({ok:true,records:records.map(summary)});
    }
    if(request.method==='GET' && parts.length===1 && safeId(parts[0])){
      const record=await readPrivateEdition(db,parts[0]);
      return record?json({ok:true,record:summary(record)}):fail(404,'not-found');
    }
    if(!write)return fail(404,'not-found');
    const input=await body(request);
    if(!input)return fail(400,'invalid-json');
    if(parts.length===1 && parts[0]==='register'){
      if(!safeId(input.editionId)||Object.keys(input).some(k=>k!=='editionId'))
        return fail(400,'only-edition-id-allowed');
      const candidate=await env.PUBLISHING_RELEASE_VERIFIER.loadCandidate(input.editionId);
      if(!candidate||candidate.editionId!==input.editionId)
        return fail(422,'verified-edition-not-found');
      const proof=await env.PUBLISHING_RELEASE_VERIFIER.verifyCompletedFile(candidate);
      const record=registerCompletedEdition(candidate,proof,now());
      await storePrivateEdition(db,record,now());
      await audit(env,'private-register',identity.subjectId,record.editionId,record.revision);
      return json({ok:true,record:summary(record)},201);
    }
    if(parts.length===2 && safeId(parts[0]) && ['schedule','cancel'].includes(parts[1])){
      const current=await readPrivateEdition(db,parts[0]);
      if(!current)return fail(404,'not-found');
      if(!Number.isSafeInteger(input.revision)||input.revision!==current.revision)
        return fail(409,'stale-revision');
      let next;
      if(parts[1]==='schedule'){
        if(typeof input.publishAt!=='string'||Object.keys(input).some(k=>!['revision','publishAt'].includes(k)))
          return fail(400,'invalid-schedule');
        const candidate=await env.PUBLISHING_RELEASE_VERIFIER.loadCandidate(current.editionId);
        if(!candidate)return fail(422,'verified-edition-not-found');
        const trusted=await env.PUBLISHING_RELEASE_VERIFIER.verifyApprovalEvidence(current,candidate);
        next=scheduleApprovedEdition(current,candidate,input.publishAt,trusted,now());
      }else{
        if(typeof input.reason!=='string'||input.reason.length>200||
          Object.keys(input).some(k=>!['revision','reason'].includes(k)))return fail(400,'invalid-cancellation');
        next=cancelUnreleasedEdition(current,input.reason);
      }
      await savePrivateTransition(db,current,next,now());
      await audit(env,parts[1],identity.subjectId,next.editionId,next.revision);
      return json({ok:true,record:summary(next)});
    }
    return fail(404,'not-found');
  } catch(e){
    const msg=String(e?.message||'');
    if(msg.startsWith('RELEASE_BLOCKED:'))return fail(422,msg.slice('RELEASE_BLOCKED:'.length));
    if(msg.includes('stale-revision')||msg.includes('edition-exists'))return fail(409,'conflict');
    return fail(503,'private-release-operation-failed');
  }
}
