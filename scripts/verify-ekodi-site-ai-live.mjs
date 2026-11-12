// Read-only live EKODI Site AI preview/fleet contract proof.
// Uses the existing audited, 20-minute production super-admin E2E session.
// Never signs in, writes to D1, approves a task, triggers releases or calls an AI model.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import sites from '../config/site-lifecycle-registry.json' with {type:'json'};
import capabilities from '../config/capability-registry.json' with {type:'json'};

export const ORIGIN='https://ekodi.kr';
const BASE='/api/control/ai/v8/site-ai';
const MAX_BYTES=180000;
const ALLOWED_SITE=/^https:\/\/ekodi\.kr\/[a-z0-9-]+\/?$/;
const fail=code=>{throw new Error(code)};
const eligible=(site)=>site?.class==='workspace_user_site'
  && ALLOWED_SITE.test(String(site?.canonicalUrl||''))
  && !/planned|preparing|pending/i.test(String(site?.migrationState||''));
const site=sites.existingWorkspaceSites.find(eligible);
const capability=capabilities.capabilities.find(x=>x.id==='core.automation'&&x.actionTier!=='forbidden');

async function safeJson(response,code){
  const type=String(response.headers.get('content-type')||'');
  const length=Number(response.headers.get('content-length')||0);
  if(!type.includes('json')||length>MAX_BYTES)fail(code+'_invalid_type_or_size');
  const content=await response.text();
  if(content.length>MAX_BYTES)fail(code+'_too_large');
  try{return JSON.parse(content)}catch{fail(code+'_invalid_json')}
}

export function verifyLiveSiteAiFleet(data){
  if(data?.ok!==true||data.contract!=='ekodi.site-ai.fleet-readonly.v1'
    ||data.integration!=='observation_only'||data.verifiedLiveAgentsAvailable!==false
    ||data.workspaceAuthorizationVerified!==false||!Array.isArray(data.entries))
    fail('site_ai_fleet_contract_invalid');
  const known=sites.existingWorkspaceSites.filter(eligible);
  if(known.length===0||data.siteCount!==known.length
    ||data.entries.length!==known.length)fail('site_ai_fleet_registry_mismatch');
  const map=new Map(data.entries.map(x=>[x.siteId,x]));
  if(map.size!==known.length)fail('site_ai_fleet_duplicate_ids');
  for(const item of known){
    const row=map.get(item.id);
    if(!row||row.siteAiRunningVerified!==false
      ||row.siteAiRegistrationVerified!==false||row.workspaceIdVerified!==false
      ||row.siteAiStatus!=='unverified'||row.detailPath!==new URL(item.canonicalUrl).pathname.replace(/\/$/,'')+'/admin/services')
      fail('site_ai_fleet_false_claim');
    if(row.lastImprovement?.productionVerified!==undefined&&row.lastImprovement.productionVerified!==false)
      fail('site_ai_fleet_production_claim');
  }
  return {siteCount:known.length,ledgerAvailable:data.ledgerAvailable===true};
}
export function verifyLiveSiteAiPreview(data){
  const plan=data?.plan;
  if(data?.ok!==true||data.previewOnly!==true||data.executionAuthorized!==false
   ||plan?.contract!=='ekodi.site-ai.micro-intent-preview.v1'||plan.status!=='proposal_only'
   ||plan.siteId!==site?.id||plan.capabilityId!=='core.automation'
   ||plan.proposedOwnerRole!=='site_ai'||plan.ownerAgentId!==null
   ||plan.siteAiRegistrationVerified!==false||plan.workspaceIdentityVerified!==false
   ||plan.executionAuthorized!==false||plan.deploymentAuthorized!==false
   ||plan.productionVerified!==false||plan.automaticPaidBudgetKrw!==0||plan.paidAutoEscalation!==false)
   fail('site_ai_preview_false_authority');
  return {siteId:site.id,capabilityId:plan.capabilityId};
}
export async function verifyProductionSiteAi({token,fetchImpl=fetch}={}){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))fail('site_ai_session_missing');
  if(!site||!capability)fail('site_ai_local_registry_unavailable');
  const request=async(method,path,{authenticate=true,origin=null,body=null}={})=>{
    const headers={accept:'application/json','cache-control':'no-store'};
    if(authenticate)headers.authorization='Bearer '+token;
    if(origin!==null)headers.origin=origin;
    if(body!==null)headers['content-type']='application/json';
    try{
      return await fetchImpl(ORIGIN+path,{method,headers,
        ...(body!==null?{body:JSON.stringify(body)}:{}),
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    }catch{fail('site_ai_network_unavailable')}
  };
  const fleetGuest=await request('GET',BASE+'/fleet',{authenticate:false});
  if(fleetGuest.ok)fail('site_ai_fleet_guest_leak');
  const previewGuest=await request('POST',BASE+'/intent-preview',{
    authenticate:false,origin:ORIGIN,body:{siteId:site.id,scope:'site_specific',action:'observe',capabilityId:capability.id}});
  if(previewGuest.ok)fail('site_ai_preview_guest_leak');
  const fleet=await request('GET',BASE+'/fleet');
  if(fleet.status!==200||!String(fleet.headers.get('cache-control')||'').includes('no-store'))
    fail('site_ai_fleet_auth_failed');
  const fleetReport=verifyLiveSiteAiFleet(await safeJson(fleet,'fleet'));
  const body={siteId:site.id,scope:'site_specific',action:'observe',capabilityId:capability.id};
  const preview=await request('POST',BASE+'/intent-preview',{origin:ORIGIN,body});
  if(preview.status!==200||!String(preview.headers.get('cache-control')||'').includes('no-store'))
    fail('site_ai_preview_auth_failed');
  const previewReport=verifyLiveSiteAiPreview(await safeJson(preview,'preview'));
  const crossOrigin=await request('POST',BASE+'/intent-preview',{origin:'https://invalid.example',body});
  if(crossOrigin.status!==403)fail('site_ai_preview_cross_origin_allowed');
  const unknown=await request('POST',BASE+'/intent-preview',{
    origin:ORIGIN,body:{...body,capabilityId:'unregistered.canary'}});
  if(unknown.status!==400)fail('site_ai_preview_unregistered_capability_allowed');
  return Object.freeze({
    ok:true,siteCount:fleetReport.siteCount,ledgerAvailable:fleetReport.ledgerAvailable,
    previewSiteId:previewReport.siteId,
    authenticatedFleet:true,authenticatedPreview:true,guestRejected:true,
    crossOriginRejected:true,unknownCapabilityRejected:true,
    productionMutationPerformed:false,paidProviderCalls:0,credentialsEmitted:false,
  });
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const report=await verifyProductionSiteAi({token:process.env.E2E_ADMIN_TOKEN});
    process.stdout.write('EKODI site-AI live proof: '+JSON.stringify(report)+'\n');
  }catch(e){
    process.stderr.write('EKODI site-AI live proof: '+String(e?.message||'unknown').slice(0,100)+'\n');
    process.exitCode=1;
  }
}
