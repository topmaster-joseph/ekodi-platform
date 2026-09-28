import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const policy=JSON.parse(read('config/canonical-api-execution-policy.json'));
const fail=message=>{console.error('[canonical-api-execution] '+message);process.exitCode=1};

if(policy.policyId!=='CANONICAL-APEX-API-001'||policy.status!=='enforced'||policy.mode!=='mandatory')fail('policy identity/status drift');
if(policy.canonicalOrigin!=='https://ekodi.kr'||policy.canonicalApiPrefix!=='/api'||policy.canonicalApiBase!=='https://ekodi.kr/api')fail('canonical API base drift');
if(policy.internalExecutionBoundary!=='CONTROL_API')fail('internal CONTROL_API boundary drift');
if(policy.csp?.retiredHostAllowed!==false||policy.csp?.wideningToRetiredHostForbidden!==true)fail('retired-host CSP prohibition missing');

const retired=String(policy.retiredPublicHost||'').trim().toLowerCase();
if(!retired)fail('retired public API host missing');

for(const file of policy.browserRuntimeFiles||[]){
  const source=read(file).toLowerCase();
  if(source.includes(retired))fail(`browser runtime reintroduced retired API host: ${file}`);
}
for(const file of policy.serverRuntimeFiles||[]){
  const source=read(file).toLowerCase();
  if(source.includes(retired))fail(`server runtime reintroduced retired public API fallback: ${file}`);
}
const siteWorker=read('site-worker.js').toLowerCase();
const adminCsp=(siteWorker.match(/const admin_csp\s*=\s*([^;]+);/i)||[])[1]||siteWorker;
if(adminCsp.includes(retired))fail('Admin CSP widened to retired API host');

const aiControl=read('ai-control-worker.js');
if(!aiControl.includes("clean(env.CONTROL_API_URL)||'https://ekodi.kr'"))fail('AI control central-session fallback is not apex canonical');

const postbuild=read('scripts/admin-performance-postbuild.mjs');
for(const asset of policy.fingerprintRequiredAssets||[]){
  if(!postbuild.includes(`'${asset}'`))fail(`Admin fingerprint graph missing ${asset}`);
}

const monitor=JSON.parse(read('monitor-status.json'));
const api=(monitor.sites||[]).find(item=>item.id==='api');
if(!api||api.domain!=='ekodi.kr'||api.url!=='https://ekodi.kr/api/health')fail('monitor snapshot still targets retired API host');

const monitorLib=read('scripts/monitor-lib.mjs');
if(!monitorLib.includes("['api', 'EKODI API', 'ekodi.kr', 'https://ekodi.kr/api/health']"))fail('monitor source of truth is not apex canonical');

const pkg=JSON.parse(read('package.json'));
if(!String(pkg.scripts?.precheck||'').includes('validate-canonical-api-execution.mjs'))fail('npm precheck does not enforce canonical API policy');

if(!process.exitCode)console.log('[canonical-api-execution] enforced: browser/Admin -> https://ekodi.kr/api, internal -> CONTROL_API');
