import { readFile } from 'node:fs/promises';
import { ADMIN_SERVICE_CATALOG, channelAdminServices, socialManagedServices, canonicalServiceSocialAdminPath } from '../admin-service-catalog.js';

const readJson=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

const [policy,sitePolicy,pkg,admin,workflow]=await Promise.all([
  readJson('config/social-hub-enforcement.json'),
  readJson('config/site-execution-enforcement.json'),
  readJson('package.json'),
  read('social-admin.js'),
  read('.github/workflows/ekodi-ai-orchestration-gate.yml'),
]);

const failures=[];
const fail=m=>failures.push(m);

if(policy.schemaVersion!==1||policy.policyId!=='SOCIAL-HUB-ENFORCEMENT-001'||policy.status!=='enforced')fail('Social Hub policy must remain enforced schema v1');
if(policy.canonicalAdminPath!=='/admin/content/social')fail('Social Hub canonical admin path drifted');
if(policy.scope?.allCurrentSites!==true||policy.scope?.allCurrentServices!==true||policy.scope?.allDescendantSitesAndServices!==true)fail('all current sites, services and descendants must remain in Social Hub scope');
if(policy.scope?.futureSitesAndServicesAutoInherit!==true||policy.scope?.perSiteOrServiceOptOutAllowed!==false)fail('future sites/services must auto-inherit with no opt-out');
if(policy.inheritance?.mode!=='mandatory-recursive'||policy.inheritance?.missingLocalChannelCenterFallsBackToCentralHub!==true)fail('mandatory recursive inheritance and central fallback are required');
if(policy.accountSecurity?.passwordStorageForbidden!==true||policy.accountSecurity?.oauthOrOfficialApiPreferred!==true)fail('password storage must stay forbidden and official OAuth/API preferred');
if(policy.accountSecurity?.tokensNeverExposedToBrowserOrPublicApi!==true||policy.accountSecurity?.secretsStoredOnlyInEncryptedVaultOrPlatformSecretStore!==true)fail('token secrecy contract drifted');
if(policy.publishing?.idempotencyRequired!==true||policy.publishing?.duplicatePublishForbidden!==true||policy.publishing?.retryWithBackoff!==true)fail('publishing idempotency/retry contract drifted');

const all=socialManagedServices();
if(all.length!==ADMIN_SERVICE_CATALOG.length)fail('social managed service coverage mismatch');
const ids=new Set();
for(const service of all){
  if(ids.has(service.id))fail('duplicate service id: '+service.id);
  ids.add(service.id);
  if(service.socialManaged!==true)fail(service.id+': socialManaged must be true');
  if(!service.socialSubjectKey)fail(service.id+': missing socialSubjectKey');
  const path=canonicalServiceSocialAdminPath(service);
  if(!path)fail(service.id+': missing Social Hub admin path');
  if(service.channelAdminSection){
    if(service.socialAdminMode!=='local-channel-center')fail(service.id+': local channel center mode required');
  }else{
    if(service.socialAdminMode!=='central-social-hub')fail(service.id+': central fallback mode required');
    if(!path.startsWith('/admin/content/social?'))fail(service.id+': central fallback must use canonical Social Hub route');
  }
}
if(channelAdminServices().length>=all.length)fail('central Social Hub fallback is not being exercised');

if(!admin.includes('socialManagedServices()'))fail('central social admin must enumerate every managed service');
if(!admin.includes('canonicalServiceSocialAdminUrl'))fail('central social admin must resolve local-or-central admin handoff');
if(!admin.includes('모든 현재·미래 EKODI 사이트와 서비스는 중앙 Social Hub 정책을 자동 상속합니다.'))fail('central social admin must explain mandatory inheritance');
if(!(sitePolicy.mandatoryContracts||[]).includes('central-social-hub-inheritance'))fail('site execution policy must include central-social-hub-inheritance');
if(!String(pkg.scripts?.['validate:social-governance']||'').includes('validate-social-hub-enforcement.mjs'))fail('package must expose validate:social-governance');
if(!String(pkg.scripts?.check||'').includes('validate:social-governance'))fail('full check must enforce social governance');
if(!String(pkg.scripts?.['validate:fast']||'').includes('validate:social-governance'))fail('fast check must enforce social governance');
if(!workflow.includes('npm run validate:social-governance'))fail('AI orchestration gate must enforce social governance');

if(failures.length){
  console.error('Social Hub enforcement failed ('+failures.length+')');
  failures.forEach(x=>console.error('- '+x));
  process.exit(1);
}
console.log('Social Hub enforcement OK: '+all.length+' services governed; '+channelAdminServices().length+' local channel centers; '+(all.length-channelAdminServices().length)+' central fallbacks');
