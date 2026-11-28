import {nameProposal} from './google-contacts-cleanup-core.js';
// Draft preparation only. A trusted server must bind the plan to authenticated owner,
// persist encrypted preimages, consume approval atomically and verify provider identity.
const text=v=>String(v??'').normalize('NFC').trim();
const clone=v=>JSON.parse(JSON.stringify(v));
const reject=code=>{throw Object.assign(new Error(code),{code})};
const strip=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
export function prepareNameCorrection(person) {
  const proposal=nameProposal(person);
  if(!proposal||proposal.status!=='review_required') reject('MANUAL_REVIEW_REQUIRED');
  const sources=person.metadata?.sources||[];
  if(sources.length!==1||sources[0].type!=='CONTACT'||!sources[0].id||!sources[0].etag) reject('CONTACT_ETAG_REQUIRED');
  const original=person.names[0];
  // Only a free-form or given-name-only record is supported; never guess family name.
  const writable=strip(original,['metadata','displayName','displayNameLastFirst']);
  const key=text(writable.unstructuredName)===proposal.original?'unstructuredName':
    text(writable.givenName)===proposal.original?'givenName':'';
  if(!key||Object.keys(writable).some(k=>k!==key&&text(writable[k]))) reject('STRUCTURED_NAME_REVIEW_REQUIRED');
  const organizations=(person.organizations||[]).map(o=>strip(o,['metadata','formattedType']));
  const orgKey=proposal.field==='title'?'title':'name';
  const org=organizations[0]||{};
  if(text(org[orgKey])&&text(org[orgKey])!==proposal.value) reject('ORGANIZATION_CONFLICT');
  const body={resourceName:person.resourceName,metadata:{sources:[{type:'CONTACT',id:sources[0].id,etag:sources[0].etag}]},names:[{[key]:proposal.proposedName}],organizations:[{...org,[orgKey]:proposal.value}]};
  return {version:1,kind:'name_organization_correction',resourceName:person.resourceName,updateMask:'names,organizations',body,preimage:clone(person),requiresApproval:true,deleteAllowed:false};
}
export function assertFreshPlan(plan,latest) {
  const fresh=prepareNameCorrection(latest);
  if(JSON.stringify(fresh.body)!==JSON.stringify(plan.body)||fresh.resourceName!==plan.resourceName||plan.updateMask!==fresh.updateMask||plan.kind!==fresh.kind||plan.version!==fresh.version||plan.deleteAllowed!==false||plan.requiresApproval!==true) reject('STALE_OR_TAMPERED_PLAN');
  return fresh;
}
