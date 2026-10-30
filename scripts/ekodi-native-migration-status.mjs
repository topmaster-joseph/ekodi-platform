/**
 * EKODI Orchestrator's own read-only automation migration projection.
 * This deliberately produces blocker evidence, never a task cutover verdict.
 * Native PR merge and generic health are NOT equivalent to a produced document,
 * human editorial approval, verified stream or a released social UI.
 */
export const AUTOMATION_MIGRATION_PR = Object.freeze([
  Object.freeze({id:'native-scheduler',number:6890}),
  Object.freeze({id:'native-cutover-gate',number:6920}),
]);

export const LEGACY_MIGRATION_WORKLOADS=Object.freeze([
  Object.freeze({id:'mission-home-production-e2e',kind:'monitor',trackingIssue:6875,missing:[
    'first_party_chromium_desktop_1440x900',
    'first_party_chromium_mobile_390x844',
    'public_photo_consent_and_media_fallback',
    'protected_space_release_sha',
    'production_mobile_readback',
    'legacy_disable_receipt'
  ]}),
  Object.freeze({id:'social-accounts-release',kind:'monitor',missing:[
    'native_scheduled_job_artifact','authenticated_social_ui_e2e',
    'released_source_sha','exclusive_writer_lease','legacy_disable_receipt'
  ]}),
  Object.freeze({id:'church-live-release',kind:'monitor',missing:[
    'native_scheduled_job_artifact','canonical_live_source_proof',
    'authenticated_studio_e2e','anonymous_viewer_e2e',
    'exclusive_writer_lease','legacy_disable_receipt'
  ]}),
  Object.freeze({id:'human-publishing-editorial',kind:'deliverable',missing:[
    'persistent_edition_and_rights_record','actual_manuscript',
    'epub_accessibility_and_human_approval','production_asset_readback',
    'exclusive_writer_lease','legacy_disable_receipt'
  ]}),
  Object.freeze({id:'church-weekly-worship',kind:'deliverable',missing:[
    'pastor_approved_scripture','real_sermon_google_doc',
    'real_bulletin_google_doc','real_worship_google_slides',
    'owner_approval','exclusive_writer_lease','legacy_disable_receipt'
  ]}),
]);

const fullSha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/i.test(s);
const cap=s=>String(s??'').slice(0,120);
const safeDate=s=>typeof s==='string'&&!Number.isNaN(Date.parse(s));

export function projectEkodiNativeMigration({proposals=[],checks=[]}={}){
  const proposalsById=new Map((Array.isArray(proposals)?proposals:[]).map(x=>[x.id,x]));
  const stages=AUTOMATION_MIGRATION_PR.map(expected=>{
    const found=proposalsById.get(expected.id);
    const raw=found?.response;
    if(!found?.ok||!raw||Number(raw.number)!==expected.number)
      return {id:expected.id,pr:expected.number,state:'unverified',reason:'source_pr_not_verified'};
    if(raw.base?.ref!=='main'||!fullSha(raw.head?.sha))
      return {id:expected.id,pr:expected.number,state:'blocked',reason:'noncanonical_pr_head'};
    const data={id:expected.id,pr:expected.number,headSha:cap(raw.head.sha)};
    if(!raw.merged_at||!fullSha(raw.merge_commit_sha))
      return {...data,state:'pending',reason:'protected_merge_not_verified'};
    if(!safeDate(raw.merged_at))
      return {...data,state:'blocked',reason:'merge_timestamp_invalid'};
    return {...data,state:'merged_requires_runtime_proof',reason:'post_merge_native_run_and_artifact_not_verified'};
  });
  const byCheck=new Map((Array.isArray(checks)?checks:[]).map(x=>[x.name,x]));
  const tasks=LEGACY_MIGRATION_WORKLOADS.map(item=>{
    let readOnlyStatus='not_observed';
    if(item.id==='social-accounts-release'){
      const check=byCheck.get('mall-sns-readiness');
      if(check)readOnlyStatus=check.status==='ok'?'infrastructure_observed':'infrastructure_incomplete';
    }else if(item.id==='church-live-release'){
      const check=byCheck.get('approved-release-receipt');
      if(check)readOnlyStatus=check.status==='ok'?'release_receipt_observed':'release_receipt_incomplete';
    }
    return {id:item.id,kind:item.kind,readOnlyStatus,
      deliveryVerified:false,cutoverAllowed:false,missingEvidence:[...item.missing]};
  });
  return Object.freeze({
    owner:'EKODI Orchestrator',
    mode:'read_only_no_legacy_cutover',
    purpose:'migration_gap_audit_not_approval',
    nativePrs:stages,tasks,
    verifiedLegacyDisabledCount:0,
    migrationCompleted:false,
    noChatgptAutomationCreated:true,
    externalActionsTaken:0,
    authorizedToChangeLegacy:false
  });
}
export function renderEkodiMigrationSummary(report){
  return ['### EKODI Automation Migration — Evidence Gap',
    '- Owner: EKODI Orchestrator; status: read-only, no cutover performed',
    ...report.nativePrs.map(pr=>'- PR #'+pr.pr+': '+pr.state+' ('+pr.reason+')'),
    ...report.tasks.map(task=>'- '+task.id+': delivery unverified; missing '+task.missingEvidence.join(', ')),
    '- Existing ChatGPT tasks must NOT be stopped based on this report alone.'].join('\n');
}
