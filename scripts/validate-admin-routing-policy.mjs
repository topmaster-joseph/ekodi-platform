import fs from 'node:fs';
import vm from 'node:vm';
import { ADMIN_MENU_REGISTRY } from '../admin-menu-registry.js';
import { isWorkspaceAdminPathShape } from '../workspace-route-policy.js';

const fail=[];
const policy=JSON.parse(fs.readFileSync('config/admin-routing-policy.json','utf8'));
const hierarchy=JSON.parse(fs.readFileSync('config/admin-site-hierarchy.json','utf8'));
const auth=JSON.parse(fs.readFileSync('governance/constitution/constitution.json','utf8')).authenticationReturnContinuityPolicy||{};

if(policy.policyId!=='ADMIN-ROUTING-001'||policy.status!=='enforced')fail.push('ADMIN-ROUTING-001 must remain enforced');
for(const key of ['independentMenuRequiresCanonicalUrl','independentSubmenuRequiresCanonicalUrl','independentDetailViewRequiresCanonicalUrl','directEntryRequired','reloadRestorationRequired','browserHistoryRequired','deepDetailSegmentsAllowed','canonicalIdentityUsesPath','hashOnlyRoutingForbiddenForCanonicalAdmin']){
  if(policy.addressability?.[key]!==true)fail.push(`addressability.${key} must remain true`);
}
if(policy.addressability?.actionButtonsRequireStandaloneUrl!==false)fail.push('pure action buttons must not require standalone URLs');
if(policy.continuity?.authenticationReturnMustPreserveExactTrustedAdminPath!==true)fail.push('exact admin auth return continuity must remain required');
if(auth.exactPreLoginReturnPreferred!==true||auth.initiatingSiteContextMustBePreserved!==true)fail.push('constitution must preserve exact trusted pre-login admin return');
if(hierarchy.routingContract?.policyId!=='ADMIN-ROUTING-001'||hierarchy.routingContract?.deepRouteAddressability!==true)fail.push('admin site hierarchy must bind ADMIN-ROUTING-001 deep-route addressability');

const source=fs.readFileSync('admin-canonical-routes.js','utf8');
const location={href:'https://ekodi.kr/admin/',hostname:'ekodi.kr',pathname:'/admin/',search:'',hash:''};
const window={location};
vm.runInNewContext(source,{window,URL,URLSearchParams,Object,Set,String,Array,decodeURIComponent,encodeURIComponent});
const routes=window.EKODIAdminRoutes;
if(!routes?.routeFromPath||!routes?.pathFor)fail.push('canonical admin route registry must expose routeFromPath and pathFor');
const seen=new Set();
for(const item of ADMIN_MENU_REGISTRY.filter(item=>!item.href)){
  const path=routes.pathFor(item.id);
  if(!path.startsWith('/admin/'))fail.push(`${item.id} missing canonical /admin path`);
  if(seen.has(path))fail.push(`duplicate canonical admin path: ${path}`);
  seen.add(path);
}
const deep=routes.pathFor('finance',['transactions','txn-123','edit']);
if(deep!=='/admin/content/finance/transactions/txn-123/edit')fail.push('platform deep admin route generation drifted');
const parsed=routes.routeFromPath(deep);
if(parsed?.section!=='finance'||JSON.stringify(parsed.detailSegments)!==JSON.stringify(['transactions','txn-123','edit']))fail.push('platform deep admin route parsing drifted');
if(!isWorkspaceAdminPathShape('/sample-workspace/admin/members/member-123/edit'))fail.push('workspace admin router must accept deep detail routes');
if(!isWorkspaceAdminPathShape('/sample-workspace/service/admin/settings/profile/edit'))fail.push('service admin router must accept deep detail routes');

if(fail.length){
  console.error(`Admin routing policy validation failed (${fail.length})`);
  for(const message of fail)console.error(`- ${message}`);
  process.exit(1);
}
console.log(`ADMIN-ROUTING-001: OK (${seen.size} canonical platform admin menu routes + deep tenant routes)`);
