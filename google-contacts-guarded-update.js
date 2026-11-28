import {prepareNameCorrection} from './google-contacts-change-plan.js';
import {sealContactSnapshot,openContactSnapshot} from './google-contacts-backup.js';
// Server-only. No route is exposed here. The injected repository must atomically
// consume the exact human approval and hold an exclusive per-Google-account write lease.
const WRITE_SCOPE='https://www.googleapis.com/auth/contacts';
const FIELDS='addresses,ageRanges,biographies,birthdays,calendarUrls,clientData,coverPhotos,emailAddresses,events,externalIds,genders,imClients,interests,locales,locations,memberships,metadata,miscKeywords,names,nicknames,occupations,organizations,phoneNumbers,photos,relations,sipAddresses,skills,urls,userDefined';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const resource=v=>typeof v==='string'&&/^people\/c[\w-]+$/.test(v);
function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'}
export async function correctionDigest(ctx,plan){
  if(!ctx||!['ownerId','googleSubject','operationId'].every(k=>id(ctx[k]))||!resource(ctx.resourceName)||plan?.resourceName!==ctx.resourceName||plan?.kind!=='name_organization_correction'||plan.version!==1||plan.updateMask!=='names,organizations'||plan.requiresApproval!==true||plan.deleteAllowed!==false||plan.body?.resourceName!==ctx.resourceName)fail('INVALID_CORRECTION_PLAN');
  const payload=['ekodi-contacts-approval-v1',ctx.ownerId,ctx.googleSubject,ctx.operationId,ctx.resourceName,plan.version,plan.kind,plan.updateMask,plan.body];
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(payload)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
async function providerJson(fetchImpl,url,token,init={}){
  const response=await fetchImpl(url,{...init,headers:{authorization:'Bearer '+token,accept:'application/json',...(init.body?{'content-type':'application/json'}:{})},redirect:'error',cache:'no-store'});
  if(!response.ok)fail('GOOGLE_REQUEST_REJECTED');
  const data=await response.json();if(!data||typeof data!=='object'||Array.isArray(data))fail('GOOGLE_RESPONSE_INVALID');return data;
}
function contactUrl(resourceName,patch=false){const u=new URL('https://people.googleapis.com/v1/'+resourceName+(patch?':updateContact':''));u.searchParams.set('personFields',FIELDS);u.searchParams.set('sources','READ_SOURCE_TYPE_CONTACT');if(patch)u.searchParams.set('updatePersonFields','names,organizations');return u.toString()}
function validatePerson(p,ctx){if(p.resourceName!==ctx.resourceName||p.metadata?.sources?.length!==1||p.metadata.sources[0].type!=='CONTACT'||!p.metadata.sources[0].etag)fail('GOOGLE_CONTACT_INVALID');return p}
function stableValue(v){if(Array.isArray(v))return v.map(stableValue).sort((a,b)=>canonical(a).localeCompare(canonical(b)));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='metadata').map(([k,x])=>[k,stableValue(x)]));return v}
function verifyResult(before,after,body){
  if(after.names?.length!==1||after.organizations?.length!==1)fail('UPDATE_VERIFICATION_FAILED');
  for(const field of ['names','organizations'])for(const [k,v] of Object.entries(body[field][0]))if(canonical(after[field][0][k])!==canonical(v))fail('UPDATE_VERIFICATION_FAILED');
  for(const field of FIELDS.split(',').filter(f=>!['metadata','names','organizations'].includes(f)))if(canonical(stableValue(before[field]??[]))!==canonical(stableValue(after[field]??[])))fail('OTHER_FIELDS_CHANGED');
}
export async function executeApprovedCorrection({actor,ctx,plan,repository,resolveConnection,resolveBackupKey,fetchImpl=fetch}={}){
  // These arguments and dependencies are provided by a trusted authenticated server, never directly by clients.
  if(!actor?.userId||actor.userId!==ctx?.ownerId)fail('OWNER_REQUIRED');
  if(!repository||!['claimApproval','saveBackup','readBackup','finishOperation'].every(k=>typeof repository[k]==='function')||typeof resolveConnection!=='function'||typeof resolveBackupKey!=='function')fail('SERVER_DEPENDENCIES_REQUIRED');
  const digest=await correctionDigest(ctx,plan);
  const c=await resolveConnection(actor.userId,ctx.googleSubject);
  if(c?.ownerId!==actor.userId||c.googleSubject!==ctx.googleSubject||!Array.isArray(c.scopes)||!c.scopes.includes(WRITE_SCOPE)||typeof c.accessToken!=='string'||!c.accessToken.trim()||/[\r\n]/.test(c.accessToken))fail('GOOGLE_WRITE_CONSENT_REQUIRED');
  const identity=await providerJson(fetchImpl,'https://openidconnect.googleapis.com/v1/userinfo',c.accessToken);
  if(identity.sub!==ctx.googleSubject)fail('GOOGLE_ACCOUNT_MISMATCH');
  const claim=await repository.claimApproval({ownerId:ctx.ownerId,googleSubject:ctx.googleSubject,operationId:ctx.operationId,resourceName:ctx.resourceName,digest});
  if(!claim?.claimed||!id(claim.leaseId))fail('APPROVAL_OR_LEASE_REQUIRED');
  const lease=claim.leaseId;let attempted=false;
  try{
    const before=validatePerson(await providerJson(fetchImpl,contactUrl(ctx.resourceName),c.accessToken),ctx);
    const fresh=prepareNameCorrection(before);
    if(await correctionDigest(ctx,fresh)!==digest)fail('STALE_OR_TAMPERED_PLAN');
    const keyInfo=await resolveBackupKey(actor.userId);const backupCtx={...ctx,keyId:keyInfo?.keyId};
    const envelope=await sealContactSnapshot(keyInfo?.key,backupCtx,before);
    await repository.saveBackup(lease,backupCtx,envelope);
    const persisted=await repository.readBackup(lease,backupCtx);
    const restored=await openContactSnapshot(keyInfo.key,backupCtx,persisted);
    if(canonical(restored)!==canonical(before))fail('BACKUP_VERIFICATION_FAILED');
    attempted=true;
    await providerJson(fetchImpl,contactUrl(ctx.resourceName,true),c.accessToken,{method:'PATCH',body:JSON.stringify(fresh.body)});
    const after=validatePerson(await providerJson(fetchImpl,contactUrl(ctx.resourceName),c.accessToken),ctx);
    verifyResult(before,after,fresh.body);
    await repository.finishOperation(lease,{status:'verified'});
    return {status:'verified',operationId:ctx.operationId};
  }catch{
    // No automatic retry of a possible mutation. The store must keep uncertain operations blocked.
    const status=attempted?'needs_reconciliation':'blocked_before_write';
    await repository.finishOperation(lease,{status});return {status,operationId:ctx.operationId};
  }
}
