// Read-only interpretation of an EKODI-owned Chromium worker receipt.
// An anonymous page snapshot never proves authenticated or released code.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ORIGIN='https://ekodi.kr';
const CONTROL_TEXT=/EKODI Control|무엇을 수행할까요/;
const clean=value=>String(value??'').slice(0,500);
const fail=reason=>({ok:false,state:'INVALID_EVIDENCE',reason,
  guestOnly:true,productionReleaseVerified:false,authenticatedAdminVerified:false});

export function classifyControlNativeGuestPreflight(report){
  if(report?.ok!==true || report?.mode!=='ekodi-owned-background-browser' ||
     report?.virtualizationProvider!=='ekodi-background-browser-worker' ||
     report?.canonicalOrigin!==ORIGIN || report?.headless!==true ||
     report?.ephemeralContext!==true || report?.activeUserProfileReused!==false ||
     report?.hostInputInjection!==false || report?.allowMutation!==false){
    return fail('native_isolation_proof_missing');
  }
  // Blocked network mutations demonstrate read-only enforcement; they are
  // expected on some guest pages, not proof of a forbidden executed request.
  if(!Array.isArray(report.results)||!Array.isArray(report.pageErrors)||
     report.pageErrors.length||!Array.isArray(report.blockedMutations))
    return fail('incomplete_or_unsafe_worker_result');
  const expected=['/admin/','/admin/control','/control'];
  const snapshots=report.results.filter(x=>x?.type==='snapshot');
  const navigations=report.results.filter(x=>x?.type==='goto');
  if(snapshots.length!==3||navigations.length!==2 ||
     report.results?.[0]?.type!=='initial-goto')return fail('expected_three_ordered_guest_snapshots');
  const paths=[];
  for(const snap of snapshots){
    if(typeof snap?.title!=='string'||typeof snap?.bodyText!=='string'||
       snap.horizontalOverflow===true)return fail('invalid_surface_snapshot');
    let url;
    try{url=new URL(snap.url)}catch{return fail('invalid_snapshot_url')}
    if(url.origin!==ORIGIN || url.username || url.password ||
       url.search || url.hash)return fail('noncanonical_snapshot_url');
    paths.push(url.pathname);
  }
  if(paths[0]!=='/admin/' && paths[0]!=='/admin')return fail('admin_home_unexpected_route');
  // Prevent mistaken proof if the browser task visited other surfaces or used
  // URLs unrelated to the required Control preflight targets.
  const requested=report.results.filter(x=>x?.type==='initial-goto'||x?.type==='goto');
  if(requested.length!==3)return fail('navigation_count_mismatch');
  for(let i=0;i<requested.length;i++){
    const destination=new URL(requested[i].url||'',ORIGIN);
    if(destination.origin!==ORIGIN)return fail('navigation_left_canonical_origin');
    if(i===1 && destination.pathname!=='/admin/control')return fail('admin_control_navigation_missing');
    if(i===2 && !['/control','/admin/control'].includes(destination.pathname))return fail('legacy_control_navigation_missing');
  }
  const controlAtAdmin=CONTROL_TEXT.test(snapshots[1].title+' '+snapshots[1].bodyText);
  const controlAtLegacy=CONTROL_TEXT.test(snapshots[2].title+' '+snapshots[2].bodyText);
  const deployed=paths[1]==='/admin/control'&&
    paths[2]==='/admin/control'&&controlAtAdmin&&controlAtLegacy;
  const legacy=paths[2]==='/control'&&controlAtLegacy&&!controlAtAdmin;
  return {
    ok:true,guestOnly:true,productionReleaseVerified:false,
    authenticatedAdminVerified:false,
    state:deployed?'GUEST_ROUTES_APPEAR_CONSISTENT':legacy?'LEGACY_ROUTES_OBSERVED':'ROUTES_REQUIRE_REVIEW',
    // Categorical observations only; no personal browser text is persisted.
    surfaces:[
      {requested:expected[0],landed:paths[0],controlContentVisible:false},
      {requested:expected[1],landed:paths[1],controlContentVisible:controlAtAdmin},
      {requested:expected[2],landed:paths[2],controlContentVisible:controlAtLegacy},
    ],
    reason:deployed?'guest_routing_canonical_but_authenticated_release_unverified':
      legacy?'control_still_standalone_and_admin_control_not_released':'guest_routing_or_content_does_not_match_expected_patterns',
    nativeProvider:'ekodi-background-browser-worker',
    sourceTaskId:clean(report.taskId),
    deviceProfile:clean(report.deviceProfile),
  };
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    const resultFile=process.argv[2];
    if(!resultFile)throw new Error('native_browser_result_path_required');
    const report=JSON.parse(await fs.readFile(resultFile,'utf8'));
    const assessment=classifyControlNativeGuestPreflight(report);
    await fs.writeFile(path.join(path.dirname(resultFile),'control-native-guest-assessment.json'),
      JSON.stringify(assessment,null,2)+'\n','utf8');
    console.log(JSON.stringify(assessment));
    if(!assessment.ok)process.exitCode=1;
  }catch{
    console.error('control_native_guest_preflight_invalid_receipt');
    process.exitCode=1;
  }
}
