import test from 'node:test';
import assert from 'node:assert/strict';
import { previewSiteAiMicroIntent,proposeMicroIntentOwnerNotice,requiredMicroIntentEvidence } from '../ekodi-site-ai-intent-preview.js';
const catalog={sites:{existingWorkspaceSites:[
 {id:'church',class:'workspace_user_site',migrationState:'retain_existing',canonicalUrl:'https://ekodi.kr/ekodichurch'},
 {id:'draft',class:'planned_surface',migrationState:'planned',canonicalUrl:'https://ekodi.kr/draft'}]},
 capabilities:{capabilities:[{id:'core.automation',actionTier:'execute_reversible'},{id:'core.documents',actionTier:'assist'},{id:'secret',actionTier:'forbidden'}]}};
const make=(patch={})=>previewSiteAiMicroIntent({siteId:'church',scope:'site_specific',action:'repair',capabilityId:'core.automation',...patch},catalog);
test('site-local repair stays in registered site AI, never authorizes execution',()=>{
 const p=make({codeChange:true});assert.equal(p.proposedOwnerRole,'site_ai');assert.equal(p.ownerAgentId,null);assert.equal(p.siteAiRegistrationVerified,false);assert.equal(p.detailPath,'/ekodichurch/admin');
 assert.equal(p.workspaceIdentityVerified,false);assert.equal(p.executionAuthorized,false);assert.equal(p.deploymentAuthorized,false);
 assert.equal(p.releaseRequired,true);assert.equal(p.releaseClassificationVerified,false);assert.equal(p.finalHumanGateDeterminedByOrchestrator,true);assert.equal(p.automaticPaidBudgetKrw,0);
});
test('shared capability is central-owned with no implicit site authority',()=>{
 const p=make({scope:'platform_common',siteId:'',action:'repair'});assert.equal(p.proposedOwnerRole,'ekodi_orchestrator');assert.equal(p.ownerAgentId,null);
 assert.equal(p.workspaceId,null);assert.equal(p.detailPath,'/admin');
});
test('deletion demands exact human gate and its receipt',()=>{
 const p=make({action:'delete',codeChange:true});assert.equal(p.humanApprovalRequired,true);
 assert.ok(requiredMicroIntentEvidence(p).mandatory.includes('exactHumanGateReceipt'));
});
test('physical actuation never auto executes',()=>{assert.equal(make({action:'robot_actuate'}).neverAutoExecute,true)});
test('material updates remain human-gated',()=>{assert.equal(make({action:'update',material:true}).humanApprovalRequired,true)});
test('ordinary reversible update remains gated by actual orchestrator',()=>{assert.equal(make({action:'update'}).requiredNextStep,'orchestrator_scoped_preflight')});
test('planned or unknown sites do not count as registered operational sites',()=>{
 assert.throws(()=>make({siteId:'draft'}),/UNREGISTERED_OR_UNAVAILABLE_SITE/);
 assert.throws(()=>make({siteId:'unknown'}),/UNREGISTERED_OR_UNAVAILABLE_SITE/);
});
test('unregistered and forbidden capabilities fail closed',()=>{
 assert.throws(()=>make({capabilityId:'unknown'}),/UNREGISTERED_CAPABILITY/);
 assert.throws(()=>make({capabilityId:'secret'}),/FORBIDDEN_CAPABILITY/);
});
test('unrecognized actions and scope fail closed',()=>{
 assert.throws(()=>make({action:'sudo'}),/UNKNOWN_ACTION_OR_SCOPE/);
 assert.throws(()=>make({scope:'other'}),/UNKNOWN_ACTION_OR_SCOPE/);
});
test('notice is a safe proposal only; paid channels require receipt',()=>{
 const p=make({action:'change_permissions'});const n=proposeMicroIntentOwnerNotice(p);
 assert.equal(n.channel,'ekodi_inbox');assert.deepEqual(n.optionalChannels,[]);
 assert.equal(n.dispatchAuthorized,false);assert.equal(n.grantsApproval,false);
 const noConsent=proposeMicroIntentOwnerNotice(p,{paidChannelReceiptVerified:true,kakaoTemplateVerified:true});
 assert.deepEqual(noConsent.optionalChannels,[]);
 const free=proposeMicroIntentOwnerNotice(p,{webPushConsentVerified:true});assert.deepEqual(free.optionalChannels,['webpush']);
 const paid=proposeMicroIntentOwnerNotice(p,{webPushConsentVerified:true,paidChannelReceiptVerified:true,channelConsentVerified:true,kakaoTemplateVerified:true});
 assert.deepEqual(paid.optionalChannels,['webpush','sms','kakao_eligible_only']);
});
test('learning and completion require authoritative evidence not generated prose',()=>{
 const p=make({codeChange:true});const e=requiredMicroIntentEvidence(p);
 assert.equal(e.claimVerified,false);assert.ok(e.mandatory.includes('productionHost'));
 assert.ok(e.mandatory.includes('siteLocalMembership'));assert.ok(e.mandatory.includes('mobileAndDesktopFunctionalVerification'));
});
test('site route must be canonical ekodi.kr path',()=>{
 const broken={...catalog,sites:{existingWorkspaceSites:[{id:'church',class:'workspace_user_site',migrationState:'active',canonicalUrl:'https://evil.example/church'}]}};
 assert.throws(()=>previewSiteAiMicroIntent({siteId:'church',scope:'site_specific',action:'repair',capabilityId:'core.automation'},broken),/CANONICAL_SITE_ROUTE_REQUIRED/);
});
