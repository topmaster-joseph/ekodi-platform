import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';

const REPORT_PATH = '.source-integrity-report.json';
const requestedBase = String(process.env.AUDIT_BASE_SHA || '').trim();
const requestedHead = String(process.env.AUDIT_HEAD_SHA || 'HEAD').trim() || 'HEAD';
const liveProbesEnabled = String(process.env.AUDIT_LIVE_PROBES || '1') !== '0';
const maxProbes = Math.max(1, Math.min(20, Number.parseInt(process.env.AUDIT_MAX_PROBES || '10', 10) || 10));

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function validCommit(ref) {
  if (!ref) return false;
  try { execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { stdio: 'ignore' }); return true; } catch { return false; }
}
function command(commandName, args) {
  const result = spawnSync(commandName, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: result.status === 0, status: result.status, output: `${result.stdout || ''}${result.stderr || ''}`.trim().slice(-8000) };
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function hostOf(rawUrl) { try { return new URL(rawUrl).hostname.toLowerCase(); } catch { return ''; } }
function isEkodiHost(host) { return host === 'ekodi.kr' || host.endsWith('.ekodi.kr'); }
function extractUrls(text) {
  const found = text.match(/https:\/\/(?:[a-z0-9-]+\.)*ekodi\.kr(?:\/[^\s"'`)<>{}\]]*)?/gi) || [];
  return found.map(value => value.replace(/[.,;:!?]+$/, ''));
}

const startedAt = new Date().toISOString();
const head = validCommit(requestedHead) ? requestedHead : 'HEAD';
let base = validCommit(requestedBase) ? requestedBase : '';
if (!base) { try { const fallback = git(['rev-parse', `${head}~1`]); if (validCommit(fallback)) base = fallback; } catch {} }
if (!base) base = head;
const rawChangedFiles = base === head ? [] : git(['diff', '--name-only', '--diff-filter=ACMRTUXB', `${base}...${head}`]).split('\n').filter(Boolean);
const ignoredFiles = new Set(['monitor-status.json', REPORT_PATH]);
const changedFiles = rawChangedFiles.filter(file => !ignoredFiles.has(file) && !file.startsWith('dist/') && !file.startsWith('.wrangler/'));
const report = { startedAt, base, head, changedFiles, liveProbesEnabled, checks: [], tests: [], warnings: [], errors: [], probes: [] };
function check(name, ok, detail = '') { report.checks.push({ name, ok, detail }); if (!ok) report.errors.push({ type: 'check', name, detail }); }
const trackedFiles = git(['ls-files']).split('\n').filter(Boolean);
const forbiddenTrackedFiles = new Set([
  'generated/user-services.js','my/user-services.js','my/capability-registry.json','my/workspace-packs.json',
  '.github/workflows/fix-development-staging-verification.yml','.github/workflows/persist-admin-display-names.yml',
  '.github/workflows/cloudflare-boundary-repair.yml','.github/workflows/release-marketing-ai-ui.yml',
  '.github/workflows/release-service-proxy-shell.yml','.github/workflows/release-work-shell.yml',
]);
for (const file of trackedFiles) {
  if (existsSync(file) && (forbiddenTrackedFiles.has(file) || file.startsWith('ops/generated-workflows/') || (file.startsWith('release/') && file.endsWith('.marker')))) {
    check(`source-cleanliness:${file}`, false, 'historical/generated artifact must remain in Git history, not the active source tree');
  }
}
for (const file of trackedFiles.filter(file => file.startsWith('.github/workflows/') && /\.ya?ml$/i.test(file))) {
  let text=''; try { text=await readFile(file,'utf8'); } catch { continue; }
  if (text.includes('git push origin HEAD:main')) check(`workflow-self-mutation:${file}`, false, 'workflow must not push directly to main');
  if (/release\/[A-Za-z0-9._-]*20[0-9]{6}/.test(text)) check(`dated-release-gate:${file}`, false, 'dated one-time release branches must not remain active workflow gates');
}
async function finish() {
  report.finishedAt = new Date().toISOString();
  report.status = report.errors.length ? 'failed' : (changedFiles.length ? 'passed' : 'no_changes');
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, changedFiles: changedFiles.length, checks: report.checks.length, tests: report.tests.length, probes: report.probes.length, warnings: report.warnings.length, errors: report.errors.length }));
  if (report.errors.length) process.exitCode = 1;
}
if (!changedFiles.length) {
  report.checks.push({ name: 'incremental-diff', ok: true, detail: 'No source/config changes since the previous successful audit.' });
  await finish();
} else {
  const jsFiles = changedFiles.filter(file => /\.(?:c?js|mjs)$/i.test(file) && existsSync(file));
  for (const file of jsFiles) { const result = command(process.execPath, ['--check', file]); check(`syntax:${file}`, result.ok, result.ok ? 'ok' : result.output); }
  const testFiles = new Set(); const has = pattern => changedFiles.some(file => pattern.test(file)); const addTest = file => { if (existsSync(file)) testFiles.add(file); };
  if (has(/(?:^|\/)(?:auth|admin-google|google-admin|customer|client-access|api-worker|wrangler\.api)/i)) for (const file of ['test/auth-worker.test.mjs','test/business-contract.test.mjs','test/client-access.test.mjs','test/control-api.test.mjs','test/customer-auth-contract.test.mjs','test/google-admin-auth-contract.test.mjs']) addTest(file);
  if (has(/(?:control-center|admin-compact|policies)/i)) for (const file of ['test/admin-compact-build.test.mjs','test/admin-compact-contract.test.mjs','test/admin-compact-navigation.test.mjs','test/policies-page-contract.test.mjs','test/static-app.test.mjs']) addTest(file);
  if (has(/finance/i)) addTest('test/finance-worker.test.mjs'); if (has(/(?:monitor|service-registry)/i)) addTest('test/monitor.test.mjs'); if (has(/(?:responsive|site-worker|\.html$|\.css$)/i)) { addTest('test/responsive-standard.test.mjs'); addTest('test/static-app.test.mjs'); }
  if (testFiles.size) { const args = ['--test', ...[...testFiles].sort()]; const result = command(process.execPath, args); report.tests.push({ command: `node ${args.join(' ')}`, ok: result.ok, output: result.output }); if (!result.ok) report.errors.push({ type: 'tests', detail: result.output }); }
  if (changedFiles.some(file => file.startsWith('books/'))) { const result = command('npm', ['run', 'validate:books']); report.tests.push({ command: 'npm run validate:books', ok: result.ok, output: result.output }); if (!result.ok) report.errors.push({ type: 'books-validation', detail: result.output }); }
  const runtimeFiles = trackedFiles.filter(file => !file.startsWith('docs/') && !file.startsWith('test/') && !file.startsWith('migrations/') && !file.startsWith('dist/') && !ignoredFiles.has(file) && (/\.(?:js|mjs|html|toml|json|yml|yaml)$/i.test(file) || file === 'service-registry.json'));
  const diffText = git(['diff', '--unified=0', `${base}...${head}`, '--', ...changedFiles]); const addedLines = diffText.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)); const removedLines = diffText.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---')).map(line => line.slice(1)); const addedUrls = unique(addedLines.flatMap(extractUrls)); const removedUrls = unique(removedLines.flatMap(extractUrls)); const addedHosts = new Set(addedUrls.map(hostOf).filter(isEkodiHost)); const removedHosts = unique(removedUrls.map(hostOf).filter(host => isEkodiHost(host) && !addedHosts.has(host)));
  if (removedHosts.length) { const ignoreLegacyLine = /\b(?:legacy|deprecated|retire|remove|delete|cleanup|grep|redirect|alias|compat|old[_-]?)\b/i; for (const oldHost of removedHosts) { const stale = []; for (const file of runtimeFiles) { let content = ''; try { content = await readFile(file, 'utf8'); } catch { continue; } content.split('\n').forEach((line, index) => { if (!line.includes(oldHost) || ignoreLegacyLine.test(line)) return; stale.push(`${file}:${index + 1}:${line.trim().slice(0, 220)}`); }); } if (stale.length) report.errors.push({ type: 'stale-domain-reference', host: oldHost, detail: stale.slice(0, 20) }); else report.checks.push({ name: `retired-domain:${oldHost}`, ok: true, detail: 'No active runtime/config references remain.' }); } }
  let apiWorker='',wranglerApi='',customerAuth='',clientAuth='',centralAuth=''; try { apiWorker=await readFile('api-worker.js','utf8'); } catch {} try { wranglerApi=await readFile('wrangler.api.toml','utf8'); } catch {} try { customerAuth=await readFile('customer-auth.js','utf8'); } catch {} try { clientAuth=await readFile('auth-site/client-auth.js','utf8'); } catch {} try { centralAuth=await readFile('auth-site/auth.js','utf8'); } catch {}
  const activeClients = new Map(); for (const line of apiWorker.split('\n')) { const match=line.match(/id:\s*'client-([^']+)'[\s\S]*?domain:\s*'([^']+)'[\s\S]*?group:\s*'client'[\s\S]*?defaultState:\s*'active'/); if(match) activeClients.set(match[1],match[2]); }
  const allowedOriginsMatch=wranglerApi.match(/ALLOWED_ORIGINS\s*=\s*"([^"]*)"/); const allowedOrigins=new Set((allowedOriginsMatch?.[1]||'').split(',').map(v=>v.trim()).filter(Boolean)); for(const [slug,domain] of activeClients) check(`cors-origin:${slug}`,allowedOrigins.has(`https://${domain}`),`expected https://${domain} in wrangler.api.toml ALLOWED_ORIGINS`);
  const tenants=new Map(); for(const match of customerAuth.matchAll(/\{\s*slug:\s*'([^']+)'[\s\S]*?domain:\s*'([^']+)'\s*\}/g)) tenants.set(match[1],match[2]); for(const [slug,domain] of activeClients){if(!tenants.has(slug))continue;check(`tenant-domain:${slug}`,tenants.get(slug)===domain,`service=${domain}, tenant=${tenants.get(slug)}`);}
  const realms=new Map(); for(const match of clientAuth.matchAll(/'([^']+)-client'\s*:\s*\{[^}]*?returnTo:\s*'([^']+)'/g)) realms.set(match[1],hostOf(match[2])); for(const [slug,domain] of tenants){if(!realms.has(slug))continue;check(`auth-return:${slug}`,realms.get(slug)===domain,`tenant=${domain}, auth-return=${realms.get(slug)}`);}
  const marketingLine=centralAuth.split('\n').find(line=>/^\s*marketing\s*:\s*\{/.test(line)); for(const [slug,domain] of activeClients){if(slug==='cgma'||!marketingLine)continue;check(`marketing-origin:${slug}`,marketingLine.includes(`https://${domain}`),`marketing auth origins should include https://${domain}`);}
  const candidateProbeUrls=[]; for(const raw of addedUrls){try{const url=new URL(raw);if(!isEkodiHost(url.hostname))continue;if(url.pathname.startsWith('/api/')&&url.pathname!=='/api/health'&&url.pathname!=='/health')continue;url.hash='';candidateProbeUrls.push(url.href);}catch{}} if(changedFiles.some(file=>['api-worker.js','customer-auth.js','auth-site/auth.js','auth-site/client-auth.js','wrangler.api.toml'].includes(file))) for(const domain of activeClients.values()) candidateProbeUrls.push(`https://${domain}/`);
  const probeUrls=unique(candidateProbeUrls).slice(0,maxProbes); if(!liveProbesEnabled&&probeUrls.length) report.warnings.push({type:'live-probes-skipped',detail:'Production pressure guard disabled live probes; static and contract checks still ran.',candidates:probeUrls});
  if(liveProbesEnabled) for(const raw of probeUrls){const started=performance.now();try{const response=await fetch(raw,{redirect:'follow',signal:AbortSignal.timeout(7000),headers:{'user-agent':'EKODI-Source-Audit/1.0'}});await response.body?.cancel();const ok=response.status>=200&&response.status<400;const item={url:raw,ok,status:response.status,responseMs:Math.round(performance.now()-started)};report.probes.push(item);if(!ok)report.errors.push({type:'live-link',...item});}catch(error){const item={url:raw,ok:false,status:null,responseMs:Math.round(performance.now()-started),error:error?.name==='TimeoutError'?'timeout':String(error?.message||error)};report.probes.push(item);report.errors.push({type:'live-link',...item});}}
  await finish();
}
