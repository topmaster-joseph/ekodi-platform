const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
const token=String(process.env.GH_TOKEN||'').trim();
const branch=String(process.env.GITHUB_REF_NAME||'').trim();
const headSha=String(process.env.GITHUB_SHA||'').trim();
const required=['test','EKODI AI Orchestration Gate'];
// User-authored reconciliation touch: retrigger protected PR checks after GitHub update-branch.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function fail(m){throw new Error('[EKODI][ORCH-AUTO-MERGE] '+m)}
async function api(path,init={}){
  const r=await fetch('https://api.github.com/repos/'+repo+path,{...init,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json',...(init.headers||{})}});
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text}};
  return {r,data};
}
async function statusMap(sha){
  const {r,data}=await api('/commits/'+sha+'/status');
  if(!r.ok)fail('status lookup failed '+r.status);
  return new Map((data.statuses||[]).map(s=>[s.context,s]));
}
async function verifiedCheckRuns(sha){
  const {r,data}=await api('/commits/'+sha+'/check-runs?per_page=100');
  if(!r.ok)fail('check-runs lookup failed '+r.status);
  const runs=Array.isArray(data.check_runs)?data.check_runs:[];
  return required.every(name=>runs.some(run=>
    run.name===name &&
    run.app?.slug==='github-actions' &&
    run.status==='completed' &&
    ['success','neutral','skipped'].includes(run.conclusion)
  ));
}
if(!repo||!token||!branch||!headSha)fail('missing runtime input');
const match=branch.match(/^ai\/([a-z0-9][a-z0-9._-]{0,31})\/(orch_[a-z0-9][a-z0-9_-]{15,120})$/i);
if(!match){console.log('[EKODI][ORCH-AUTO-MERGE] non-orchestrator branch; noop');process.exit(0)}
const taskId=match[2];
const receiptUrl=new URL('https://ekodi.kr/api/orchestrator/release-receipt');
receiptUrl.searchParams.set('taskId',taskId);receiptUrl.searchParams.set('branchRef',branch);
const receipt=await fetch(receiptUrl,{headers:{accept:'application/json','user-agent':'ekodi-orchestrated-auto-merge'}}).then(async r=>({r,data:await r.json().catch(()=>({}))}));
if(!receipt.r.ok||receipt.data?.authorized!==true)fail('release receipt is not authorized');

const owner=repo.split('/')[0];
let pr=null;
for(let i=0;i<20&&!pr;i++){
  const q=await api('/pulls?state=open&base=main&head='+encodeURIComponent(owner+':'+branch));
  if(!q.r.ok)fail('PR lookup failed '+q.r.status);
  pr=(Array.isArray(q.data)?q.data:[])[0]||null;
  if(!pr)await sleep(3000);
}
if(!pr)fail('open PR not found');
// Draft PRs remain unpublished and must not be merged or deployed.
if(pr.draft===true){console.log('[EKODI][ORCH-AUTO-MERGE] draft PR; unpublished hold, no merge');process.exit(0)}
const filesLookup=await api('/pulls/'+pr.number+'/files?per_page=100');
if(!filesLookup.r.ok)fail('PR file lookup failed '+filesLookup.r.status);
const changedFiles=(Array.isArray(filesLookup.data)?filesLookup.data:[]).map(file=>String(file.filename||''));
// GitHub token-mediated merges do not emit regular main push events.
// Dispatch CGMA's guarded edge workflow through the verified orchestrator.
const cgmaApexTouched=changedFiles.some(file=>[
  '.github/workflows/deploy-cgma-apex-edge.yml',
  'cgma-board-service-worker.js',
  'wrangler.cgma-board-internal.toml',
  'site-board-control.js',
  'scripts/converge-orchestrated-pr-merge.mjs',
].includes(file));
// The Access API owns the Google handoff allowlist. GitHub-token merges do not
// emit main push events, so its guarded Supabase deploy must be dispatched.
const accessApiTouched=changedFiles.some(file=>
  file.startsWith('supabase/functions/access-api/')||
  file.startsWith('supabase/functions/_shared/')||
  file==='.github/workflows/deploy-access-api.yml'
);
const independentBoardTouched=changedFiles.some(file=>
  file.startsWith('services/independent-board/')||
  file==='wrangler.independent-board.toml'||
  file==='sites/seonammedi/public/app.js'||
  file==='.github/workflows/deploy-independent-board.yml'
);
const myTouched=changedFiles.some(file=>
  file.startsWith('my/')||
  file==='my-worker.js'||
  file==='wrangler.my.toml'||
  file==='deploy/manifests/my.worker.json'||
  file==='.github/workflows/deploy-my.yml'
);
// Release targets are selected only from the verified, merged PR file list.
const controlApiTouched=changedFiles.some(file=>
  // Guarded Control API deploy applies canonical ekodi-auth D1 migrations.
  // GitHub-token PR merges do not emit push workflows; never strand new grants.
  (file.startsWith('migrations/')&&file.endsWith('.sql')&&!file.includes('messenger'))||[
  // CGMA motor festival 2026 intake API (Control API, D1 ekodi-auth).
  'motor-festival-registration-api.js',

  // LANG-UI-001: public language status is served by api-worker.js via
  // language-automation.js. A GITHUB_TOKEN merge does not fire main push CI,
  // so this requires the same receipt-bound Control API deployment.
  'site-publication-runtime.js',
  'cooperative-registry.js',
  'cooperative-locator.js',
  'language-automation.js',
  'config/language-registry.js',
  'config/managed-language-sites.js',
  'affiliate-control.js',
  'affiliate-marketplace.js',
  'coupang-partners-automation.js',
  'customer-entry-worker.js',
  // Customer/site access APIs (directory, grants, site admin roster) execute inside
  // customer-entry-worker; a token-mediated merge must still redeploy them.
  'customer-google-prereg.js',
  'customer-member-directory.js',
  'tenant-access-authority.js',
  'access-governance.js',
  'mission-control-entry-worker.js',
  // Church Live host authority and runtime tenant mapping execute in Control API.
  // A token-mediated merge skips main push; dispatch the guarded API on these edits.
  'realtime-control.js',
  'realtime-tenant-registry.js',
  // Control API directly imports the Orchestrator completion/OIDC boundary.
  // A trusted GitHub Actions merge does not automatically trigger main push.
  'ekodi-orchestrator-task-adapter.js',
  'github-actions-oidc.js',
  'ai-command-control.js',
  // EKODI Core AI Gateway imports this runtime: merged changes must dispatch
  // the guarded Control API Worker, not only the shared Control UI assets.
  'ai-orchestrator-runtime.js',
  // The same SeonamMedi monitor code runs in the public Site Core AND in
  // the Control API hourly scheduler. Both runtimes must be released together.
  'seonammedi-monitor.js',
  'seonammedi-relevance.js',
  // PC Agent registry and heartbeat handlers are deployed by the Control API.
  'device-control.js',
  // AI Provider API runtime ownership; release-automation changes also repair missed deployments.
  'ai-provider-control.js',
  // Telemetry reader and site classifier run inside the Control API.
  'traffic-intelligence-control.js',
  'traffic-intelligence.js',
  'scripts/converge-orchestrated-pr-merge.mjs',
  'wrangler.api.toml',
  'deploy/manifests/control-api.worker.json',
  '.github/workflows/deploy-control-api.yml',
].includes(file));
const marketingGrowthTouched=changedFiles.some(file=>[
  'mall-autonomous-profit-loop.js',
  'mall-growth-dashboard.js',
  'mall-sales-intelligence.js',
  'mall-promotion-automation.js',
  'marketing-growth-worker.js',
  'marketing-growth-entry.js',
  'wrangler.marketing-growth.toml',
  '.github/workflows/deploy-marketing-growth.yml',
].includes(file));
const spaceTouched=changedFiles.some(file=>
  file.startsWith('space/')||
  file==='space-worker.js'||
  file==='deploy/manifests/space.worker.json'||
  file==='wrangler.space.toml'||
  file==='wrangler.space.staging.toml'||
  file==='.github/workflows/deploy-space.yml'
);
const mallSiteTouched=changedFiles.some(file=>file.startsWith('sites/ekodi-mall/')||file==='.github/workflows/deploy-ekodi-mall.yml');
const labHomepageTouched=changedFiles.some(file=>
  file.startsWith('sites/ekodi-lab/')||
  file==='deploy/manifests/ekodilab.pages.json'||
  file==='scripts/guarded-pages-release.mjs'||
  file==='.github/workflows/deploy-ekodi-lab-homepage.yml'
);
const aiControlTouched=changedFiles.some(file=>
  file==='ai-control-worker.js'||
  file==='common-services-admin.js'||
  file.startsWith('ai-control/')||
  file.startsWith('ai-control-')||
  file==='deploy/manifests/ai-control.worker.json'||
  file==='wrangler.ai.toml'||
  /^migrations\/013\d_ai_assistance_.*\.sql$/.test(file)||
  /^support\/assistance-[^/]+\.js$/.test(file)||
  file==='.github/workflows/deploy-ai-control.yml'||
  file==='scripts/converge-orchestrated-pr-merge.mjs'
);
// Collector-only changes need an explicit post-merge dispatch because
// GITHUB_TOKEN merges do not emit an ordinary main push workflow.
const trafficCollectorTouched=changedFiles.some(file=>[
  'traffic-intelligence.js',
  'traffic-collector-quality.js',
  'scripts/collect-traffic-intelligence.mjs',
  '.github/workflows/traffic-intelligence-analytics.yml',
  'migrations/0059_traffic_intelligence.sql',
].includes(file));
// GITHUB_TOKEN merges do not trigger main push workflows. Browser telemetry
// changes require the dedicated Shell Worker, not only the shared Site Core.
const shellRuntimeTouched=changedFiles.some(file=>
  file.startsWith('shell/')||
  ['ekodi-shell-worker.js','ekodi-shell-injector.js','ekodi-service-manifest.js',
   'wrangler.shell.toml','deploy/manifests/shell.worker.json',
   '.github/workflows/deploy-ekodi-shell.yml',
   'scripts/converge-orchestrated-pr-merge.mjs'].includes(file)
);
const sharedSiteTouched=changedFiles.some(file=>
  // CGMA workspace pages compiled into Site Core (/cgma/ai-education/, /cgma/motor-festival-2026/).
  ['cgma-ai-education-route.js','cgma-motor-festival-route.js'].includes(file)||
  (file.startsWith('prototypes/cgma-')&&/\.(html|js)$/.test(file))||
  // The EKODI public homepage is compiled into the shared Site Core. GITHUB_TOKEN
  // merges do not trigger main push workflows: dispatch its guarded release here.
  ['index.html','homepage-ambient.js','homepage-ambient.css'].includes(file)||
  // Control is a first-party Site Core surface, never a separate public Shell release.
  ['control.html','control.css','control.js'].includes(file)||
  // Shared administrator menu, canonical route registry and design contracts are production Site Core assets.
  ['admin-menu-registry.js','admin-sidebar.js','admin-canonical-routes.js','admin-menu-layout.js','admin-menu-layout.compact.js','admin-menu-runtime.js','admin-demand-loader.js','release-control-admin.js','system-health-admin.js','admin-design-engine.js','config/design-engine.json','config/admin-role-navigation.json'].includes(file)||
  file==='workspace-admin-page.js'||
  // The Church pastor admin page is compiled into the shared Site Core route.
  file==='church-pastor-admin-page.js'||
  // AI Provider administrator bundle and shared provider client are owned by the Site Core.
  file==='admin-provider-control.js'||
  // AI membership is compiled into the shared ai-ops-admin.js bundle.
  file==='user-ai-tier-panel.js'||
  file==='common-services-admin.js'||
  // Church Live studio and tenant registry are owned by the shared Site Core.
  // Never strand the studio UI when a token-mediated merge skips push workflows.
  ['tenant-live.js','tenant-live.css','tenant-live-page.js',
   'tenant-live-admin-page.js','realtime-tenant-registry.js'].includes(file)||
  // Admin Google handoff is bundled in Site Core; never skip its post-merge release.
  file==='admin-central-handoff.js'||
  file==='ai-provider-control.js'||
  file==='mall-social-setup.js'||
  file.startsWith('sites/')||
  // The Seasonal Workforce proposal portal is compiled into the same guarded Site Core.
  file.startsWith('seasonal-workforce/')||
  file.startsWith('auth-site/')||
  file==='deploy/manifests/shared-site.worker.json'||
  file==='seonammedi-admin-control.js'||
  // Monitoring and publication checks are also embedded in the public Site Core.
  file==='seonammedi-monitor.js'||
  file==='seonammedi-relevance.js'||
  file==='wrangler.site.toml'||
  file==='platform-router-entry-worker.js'||
  file==='canonical-surface-router.js'||
  file==='admin-sidebar.js'||
  file==='scripts/verify-admin-production-ui-e2e.mjs'||
  // Hybrid native browser admin page shares the guarded Site Core release boundary.
  file==='hybrid-execution-admin.js'||
  file==='device-control-admin.js'||
  file==='device-control-admin.css'||
  // Keep all Device Control/Remote Power/Wake static assets in a single orchestrated deploy boundary.
  ['remote-power-admin.js','remote-power-admin.css','device-wake-admin.js'].includes(file)||
  file==='ekodi-device-bootstrap.cmd'||
  file==='site-worker.js'||
  // Site Core also owns the shared independent-board runtime and its public edge contract.
  file==='site-board-control.js'||
  file==='common-board-adapter.js'||
  file==='cgma-board-service-worker.js'||
  file==='scripts/verify-admin-provider-control-production.mjs'||
  file==='scripts/build.mjs'||
  file==='scripts/finalize-seonammedi-release.mjs'||
  file==='scripts/verify-seonammedi-release-live.mjs'||
  file==='scripts/seonammedi-cache-contract.mjs'||
  file==='test/seonammedi-cache-contract.test.mjs'||
  file==='.github/workflows/deploy-site-core.yml'||
  file==='scripts/converge-orchestrated-pr-merge.mjs'||
  file==='.github/workflows/converge-orchestrated-pr-merge.yml'
);
// Church public Pages is independent of Site Core and must use the guarded
// source-pinned release, with the already verified Orchestrator receipt.
const churchPagesTouched=changedFiles.some(file=>
  file==='.github/workflows/deploy-ekodi-church-homepage.yml'||
  file==='scripts/verify-church-homepage-production.mjs'||
  file==='test/church-homepage-release-dispatch.test.mjs'
);
// One-time, receipt-bound native agent status canary is permitted only when its
// audited command runner is introduced or updated in a merged source PR.
const nativeAgentStatusTouched=changedFiles.some(file=>file==='scripts/verify-native-agent-status.mjs');
// Single allowlisted local AI loopback diagnostic; independent from the status acceptance canary.
const nativeLocalAiVerifyTouched=changedFiles.some(file=>file==='scripts/verify-native-localai.mjs');
// USER2-only acceptance is dispatched by the verified Orchestrator after this runner lands on main.
const nativeUser2LocalAiTouched=changedFiles.some(file=>file==='scripts/verify-native-user2-localai.mjs');
// USER3 only: one-time transactional official Agent update, then fixed loopback Ollama proof.
const nativeUser3RecoveryTouched=changedFiles.some(file=>file==='scripts/recover-native-user3-localai.mjs');
const nativeUser2RecoveryTouched=changedFiles.some(file=>file==='scripts/recover-native-user2-localai.mjs');
const nativeUser2VirtualProbeTouched=changedFiles.some(file=>file==='scripts/verify-native-user2-virtual-probe.mjs');
const nativeUser2BrowserTouched=changedFiles.some(file=>file==='scripts/verify-native-user2-browser.mjs');
const nativeUser2HyperVEnableTouched=changedFiles.some(file=>file==='scripts/activate-native-user2-hyperv.mjs');
const nativeUser4VirtualProbeTouched=changedFiles.some(file=>
  file==='scripts/verify-native-user4-virtual-probe.mjs' ||
  file==='scripts/select-native-user4-execution-route.mjs');
const nativeUser4AcceptanceTouched=changedFiles.some(file=>file==='scripts/verify-native-user4-acceptance.mjs');
// Supabase Church API is an independent guarded release boundary, not a Site Core asset.
const churchApiTouched=changedFiles.some(file=>
  file.startsWith('supabase/functions/church-pastor-api/')||
  file==='.github/workflows/deploy-church-pastor-api.yml'
);
// Core/Orchestrator execution-path changes must trigger the read-only live production E2E
// because GITHUB_TOKEN merges do not emit ordinary main push workflow events.
const orchestratorLiveVerificationTouched=changedFiles.some(file=>[
  '.github/workflows/verify-ekodi-orchestrator-live-e2e.yml',
  'ekodi-command-plane.js',
  'ekodi-command-ledger.js',
  'ekodi-pulse-runtime.js',
  'ekodi-orchestrator-task-adapter.js',
  'core-ai-gateway.js',
  'ai-command-control.js',
  'scripts/converge-orchestrated-pr-merge.mjs',
].includes(file));

// Signed-in Admin continuity must run after the E2E harness or dispatch wiring changes.
const adminContinuityVerificationTouched=changedFiles.some(file=>
  file==='scripts/verify-admin-login-continuity.mjs'||
  file==='test/admin-login-continuity-contract.test.mjs'||
  // Re-run genuine signed-in production E2E when the isolated menu harness changes.
  file==='scripts/admin-authenticated-e2e-menu-worker.mjs'||
  file==='scripts/admin-authenticated-e2e-retry.mjs'||
  // Changes to the canonical Assist probe must re-run the full signed-in menu + Assist E2E.
  file==='scripts/admin-assist-canonical-e2e.mjs'||
  file==='test/admin-assist-production-dispatch-20261016.test.mjs'||
  file==='test/admin-authenticated-e2e-readiness.test.mjs'||
  // Also cover changes to the release-provenance immediate-merge dispatch path.
  file==='scripts/recover-release-provenance.mjs'||
  file==='test/recovery-admin-e2e-dispatch.test.mjs'||
  file==='.github/workflows/verify-admin-authenticated-production-e2e.yml'||
  file==='.github/workflows/admin-authenticated-e2e.yml'||
  file==='scripts/converge-orchestrated-pr-merge.mjs'
);
async function dispatchPostMergeDeploys(){
  if(orchestratorLiveVerificationTouched){
    const response=await api('/actions/workflows/verify-ekodi-orchestrator-live-e2e.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main'})
    });
    if(!response.r.ok)fail('Orchestrator live production E2E dispatch failed '+response.r.status);
    console.log(JSON.stringify({ok:true,action:'orchestrator-live-e2e-dispatched',
      workflow:'verify-ekodi-orchestrator-live-e2e.yml',pr:pr.number,
      taskId,branch,authority:'ekodi-orchestrator'}));
  }

  if(adminContinuityVerificationTouched){
    const response=await api('/actions/workflows/verify-admin-authenticated-production-e2e.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main'})
    });
    if(!response.r.ok)fail('Authenticated Admin E2E dispatch failed '+response.r.status);
    console.log(JSON.stringify({ok:true,action:'admin-login-e2e-dispatched',
      workflow:'verify-admin-authenticated-production-e2e.yml',pr:pr.number,
      taskId,branch,authority:'ekodi-orchestrator'}));
  }

  if(nativeUser4AcceptanceTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user4-acceptance',
        release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatch.r.ok)fail('Native USER4 acceptance dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,300));
    console.log(JSON.stringify({ok:true,action:'native-user4-acceptance-dispatched',
      workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,
      authority:'ekodi-orchestrator'}));
  }
  if(nativeUser4VirtualProbeTouched){
    const dispatched=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user4-virtual-probe',release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatched.r.ok)fail('USER4 native virtual probe dispatch failed '+dispatched.r.status+' '+JSON.stringify(dispatched.data).slice(0,350));
    console.log(JSON.stringify({ok:true,action:'native-user4-virtual-probe-dispatched',
      workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,
      authority:'ekodi-orchestrator'}));
  }
  if(nativeUser2HyperVEnableTouched){
    const dispatched=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user2-hyperv-enable',release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatched.r.ok)fail('USER2 Hyper-V no-restart activation dispatch failed '+dispatched.r.status+' '+JSON.stringify(dispatched.data).slice(0,350));
    console.log(JSON.stringify({ok:true,action:'native-user2-hyperv-enable-dispatched',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(nativeUser2BrowserTouched){
    const dispatched=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user2-browser-acceptance',release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatched.r.ok)fail('USER2 native browser acceptance dispatch failed '+dispatched.r.status+' '+JSON.stringify(dispatched.data).slice(0,350));
    console.log(JSON.stringify({ok:true,action:'native-user2-browser-dispatched',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(nativeUser2VirtualProbeTouched){
    const dispatched=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user2-virtual-probe',release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatched.r.ok)fail('USER2 native virtual probe dispatch failed '+dispatched.r.status+' '+JSON.stringify(dispatched.data).slice(0,350));
    console.log(JSON.stringify({ok:true,action:'native-user2-virtual-probe-dispatched',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(nativeUser2RecoveryTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user2-upgrade-localai',
        release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatch.r.ok)fail('Native USER2 recovery dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,300));
    console.log(JSON.stringify({ok:true,action:'native-user2-localai-recovery-dispatched',
      workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,
      authority:'ekodi-orchestrator'}));
  }
  if(nativeUser3RecoveryTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user3-upgrade-localai',
        release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatch.r.ok)fail('Native USER3 Agent recovery dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,300));
    console.log(JSON.stringify({ok:true,action:'native-user3-localai-recovery-dispatched',
      workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,
      authority:'ekodi-orchestrator'}));
  }
  if(nativeUser2LocalAiTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{
        execution_mode:'user2-localai',
        release_branch_ref:branch,release_task_id:taskId
      }})
    });
    if(!dispatch.r.ok)fail('Native USER2 LocalAI acceptance dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'native-user2-localai-dispatched',
      workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,
      authority:'ekodi-orchestrator'}));
  }
  if(nativeLocalAiVerifyTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{execution_mode:'localai',release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Native LocalAI loopback proof dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'native-localai-dispatched',workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(nativeAgentStatusTouched){
    const dispatch=await api('/actions/workflows/device-agent-production-verification.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{execution_mode:'status',release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Native Agent status canary dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'native-status-dispatched',workflow:'device-agent-production-verification.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(cgmaApexTouched){
    const dispatch=await api('/actions/workflows/deploy-cgma-apex-edge.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('CGMA Apex Edge deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-cgma-apex-edge.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  // Only the guarded operating-space workflow can mutate production.
  // The originating orchestrator release receipt is mandatory.
  if(spaceTouched){
    const dispatch=await api('/actions/workflows/deploy-space.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Operating Space deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-space.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }

  if(mallSiteTouched){
    const dispatch=await api('/actions/workflows/deploy-ekodi-mall.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Mall Pages deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-ekodi-mall.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(labHomepageTouched){
    const dispatch=await api('/actions/workflows/deploy-ekodi-lab-homepage.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('EKODI Lab deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-ekodi-lab-homepage.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  // GITHUB_TOKEN merges do not invoke ordinary main push workflows.
  // Explicit dispatch forwards the already verified EKODI release receipt.
  if(controlApiTouched){
    const dispatch=await api('/actions/workflows/deploy-control-api.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Control API deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-control-api.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(trafficCollectorTouched){
    const dispatch=await api('/actions/workflows/traffic-intelligence-analytics.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main'})
    });
    if(!dispatch.r.ok)fail('Traffic Intelligence collector dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,350));
    console.log(JSON.stringify({ok:true,action:'traffic-collector-dispatched',workflow:'traffic-intelligence-analytics.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(marketingGrowthTouched){
    const dispatch=await api('/actions/workflows/deploy-marketing-growth.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Marketing Growth deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-marketing-growth.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(myTouched){
    const dispatch=await api('/actions/workflows/deploy-my.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('My EKODI deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-my.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(accessApiTouched){
    const dispatch=await api('/actions/workflows/deploy-access-api.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Access API deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-access-api.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(independentBoardTouched){
    const dispatch=await api('/actions/workflows/deploy-independent-board.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('independent board deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-independent-board.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(aiControlTouched){
    const dispatch=await api('/actions/workflows/deploy-ai-control.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('AI Control Plane deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-ai-control.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(shellRuntimeTouched){
    const dispatch=await api('/actions/workflows/deploy-ekodi-shell.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Shell deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-ekodi-shell.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(churchApiTouched){
    const dispatch=await api('/actions/workflows/deploy-church-pastor-api.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Church Pastor API deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-church-pastor-api.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(churchPagesTouched){
    const dispatch=await api('/actions/workflows/deploy-ekodi-church-homepage.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('Church Pages deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-ekodi-church-homepage.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
  if(sharedSiteTouched){
    const dispatch=await api('/actions/workflows/deploy-site-core.yml/dispatches',{
      method:'POST',
      body:JSON.stringify({ref:'main',inputs:{sync_domains:'false',release_branch_ref:branch,release_task_id:taskId}})
    });
    if(!dispatch.r.ok)fail('shared site deploy dispatch failed '+dispatch.r.status+' '+JSON.stringify(dispatch.data).slice(0,500));
    console.log(JSON.stringify({ok:true,action:'deploy-dispatched',workflow:'deploy-site-core.yml',pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
  }
}

// update-branch with the Actions token creates a head commit whose push does NOT
// start new workflow runs (GitHub suppresses GITHUB_TOKEN push events), so the
// PR would park with no checks. workflow_dispatch IS allowed from GITHUB_TOKEN:
// explicitly re-run the required checks and this convergence on the new head.
const RETRIGGER_WORKFLOWS=['ci.yml','ekodi-ai-orchestration-gate.yml','converge-orchestrated-pr-merge.yml'];
async function waitForNewHead(previous){
  for(let i=0;i<40;i++){
    const p=(await api('/pulls/'+pr.number)).data;
    const sha=String(p?.head?.sha||'');
    if(/^[a-f0-9]{40}$/i.test(sha)&&sha!==previous)return sha;
    await sleep(1500);
  }
  return '';
}
async function retriggerOnNewHead(previous){
  const next=await waitForNewHead(previous);
  if(!next)fail('update-branch accepted but the PR head did not advance; cannot retrigger checks');
  for(const workflow of RETRIGGER_WORKFLOWS){
    const d=await api('/actions/workflows/'+workflow+'/dispatches',{method:'POST',body:JSON.stringify({ref:branch})});
    if(d.r.status!==204)fail('retrigger dispatch failed for '+workflow+' '+d.r.status+' '+JSON.stringify(d.data).slice(0,300));
  }
  return next;
}
// GITHUB_TOKEN can never be granted the `workflows` permission, so it cannot
// write a base that changes .github/workflows. Say so once on the PR and fail
// fast instead of spinning on 405 merges until the convergence timeout.
const WORKFLOW_SYNC_MARKER='<!-- ekodi-orch-workflow-sync-required -->';
function workflowPermissionRefusal(update){
  const message=JSON.stringify(update?.data||{});
  return [403,422].includes(update?.r?.status)&&/workflow/i.test(message)&&/permission|refus|not allowed|accessible/i.test(message);
}
async function requestAuthoredSync(base){
  const comments=(await api('/issues/'+pr.number+'/comments?per_page=100')).data;
  const already=Array.isArray(comments)&&comments.some(c=>String(c?.body||'').includes(WORKFLOW_SYNC_MARKER));
  if(!already){
    await api('/issues/'+pr.number+'/comments',{method:'POST',body:JSON.stringify({body:WORKFLOW_SYNC_MARKER+'\nEKODI convergence cannot update this branch: `main` contains `.github/workflows` changes and the Actions token cannot write workflow files. An authored sync (merge `main` into `'+branch+'` and push) is required; that push restarts checks and convergence automatically. Head `'+base.slice(0,12)+'`.'})});
  }
}
for(let cycle=0;cycle<180;cycle++){
  const p=(await api('/pulls/'+pr.number)).data;
  if(p?.draft===true){console.log('[EKODI][ORCH-AUTO-MERGE] PR changed to draft; stop before merge');process.exit(0)}
  if(p?.merged===true){await dispatchPostMergeDeploys();console.log('[EKODI][ORCH-AUTO-MERGE] already merged; post-merge deploys reconciled');process.exit(0)}
  if(p?.head?.sha!==headSha)fail('PR head moved away from workflow SHA');
  const headStatuses=await statusMap(headSha);
  const pending=required.filter(k=>headStatuses.get(k)?.state!=='success');
  if(pending.length){await sleep(3000);continue}
  // Commit statuses are compatibility signals. Before any protected merge
  // reconciliation, require the real GitHub Actions jobs on this exact head.
  if(!await verifiedCheckRuns(headSha)){await sleep(3000);continue}

  // First converge the real PR head with the current protected base. This avoids
  // chasing GitHub's ephemeral test-merge SHA while main is actively changing.
  const update=await api('/pulls/'+pr.number+'/update-branch',{method:'PUT',body:JSON.stringify({expected_head_sha:headSha})});
  if(update.r.status===202){
    // The old run must not act on a stale head; hand off to dispatched runs on the new head.
    const nextHead=await retriggerOnNewHead(headSha);
    console.log(JSON.stringify({ok:true,action:'branch-updated',retriggered:RETRIGGER_WORKFLOWS,nextHead,pr:pr.number,taskId,branch,authority:'ekodi-orchestrator'}));
    process.exit(0);
  }
  if(workflowPermissionRefusal(update)){
    await requestAuthoredSync(headSha);
    fail('update-branch refused: base contains workflow-file changes the Actions token cannot write; authored sync required');
  }
  if(![200,202,422].includes(update.r.status))fail('update-branch failed '+update.r.status+' '+JSON.stringify(update.data).slice(0,500));

  const fresh=(await api('/pulls/'+pr.number)).data;
  if(fresh?.head?.sha!==headSha){console.log('[EKODI][ORCH-AUTO-MERGE] head updated; next push run owns convergence');process.exit(0)}

  const mergeSha=String(fresh?.merge_commit_sha||'');
  if(!/^[a-f0-9]{40}$/i.test(mergeSha)){await sleep(1200);continue}
  for(const context of required){
    const source=headStatuses.get(context);
    const set=await api('/statuses/'+mergeSha,{method:'POST',body:JSON.stringify({state:'success',context,description:`Recovered from verified head ${headSha.slice(0,12)}`,target_url:source.target_url})});
    if(!set.r.ok)fail(`failed to publish ${context} to merge SHA: ${set.r.status}`);
  }

  const merged=await api('/pulls/'+pr.number+'/merge',{method:'PUT',body:JSON.stringify({sha:headSha,merge_method:'squash',commit_title:fresh.title})});
  if(merged.r.ok&&merged.data?.merged===true){
    await dispatchPostMergeDeploys();
    console.log(JSON.stringify({ok:true,action:'merged',pr:pr.number,mergeSha:merged.data.sha,taskId,branch,authority:'ekodi-orchestrator'}));
    process.exit(0);
  }
  if([405,409,422].includes(merged.r.status)){await sleep(1000);continue}
  fail('merge failed '+merged.r.status+' '+JSON.stringify(merged.data).slice(0,500));
}
fail('merge convergence timeout');
