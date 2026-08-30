import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) throw new Error(`${path}: patch produced no change`);
  fs.writeFileSync(path, after);
}

patch('scripts/guarded-worker-release.mjs', source => {
  source = source.replace(
    "async function fetchCheck(request, overrideVersion = '') {\n  const statuses = Array.isArray(request.statuses) && request.statuses.length ? request.statuses : [200];",
    "async function fetchCheck(request, overrideVersion = '', phase = 'standard') {\n  if (phase === 'rollback' && request.rollbackVerify === false) {\n    console.log(`↩️ rollback verification skipped for candidate-only request: ${request.url}`);\n    return;\n  }\n  const statuses = Array.isArray(request.statuses) && request.statuses.length ? request.statuses : [200];\n  const bodyExpect = phase === 'rollback' && Array.isArray(request.rollbackExpect) ? request.rollbackExpect : (request.expect || []);\n  const bodyForbid = phase === 'rollback' && Array.isArray(request.rollbackForbid) ? request.rollbackForbid : (request.forbid || []);\n  const headerExpect = phase === 'rollback' && Array.isArray(request.rollbackHeaderExpect) ? request.rollbackHeaderExpect : (request.headerExpect || []);"
  );
  source = source.replace('      for (const marker of request.expect || []) {', '      for (const marker of bodyExpect) {');
  source = source.replace('      for (const marker of request.forbid || []) {', '      for (const marker of bodyForbid) {');
  source = source.replace('      for (const marker of request.headerExpect || []) {', '      for (const marker of headerExpect) {');
  source = source.replace(
    "async function verifyAll(overrideVersion = '') {\n  for (const request of worker.requests) await fetchCheck(request, overrideVersion);\n}",
    "async function verifyAll(overrideVersion = '', phase = 'standard') {\n  for (const request of worker.requests) await fetchCheck(request, overrideVersion, phase);\n}"
  );
  source = source.replace("      await verifyAll('');\n      console.error('✅ Automatic rollback verified.');", "      await verifyAll('', 'rollback');\n      console.error('✅ Automatic rollback verified against the stable rollback contract.');");
  for (const marker of ['rollbackVerify === false', 'rollbackExpect', "verifyAll('', 'rollback')"]) {
    if (!source.includes(marker)) throw new Error(`guard marker missing: ${marker}`);
  }
  return source;
});

patch('deploy/manifests/shared-site.worker.json', source => {
  const manifest = JSON.parse(source);
  manifest.version = 34;
  const demand = manifest.worker.requests.find(r => r.url.includes('/admin-demand-loader.js'));
  if (!demand) throw new Error('admin demand loader request missing');
  demand.rollbackExpect = ["label: '기기 관리'", 'device-browser-diagnostics.js', 'device-browser-diagnostics.css'];
  const remoteJs = manifest.worker.requests.find(r => r.url.includes('/remote-power-admin.js'));
  const remoteCss = manifest.worker.requests.find(r => r.url.includes('/remote-power-admin.css'));
  if (!remoteJs || !remoteCss) throw new Error('remote power requests missing');
  remoteJs.rollbackVerify = false;
  remoteCss.rollbackVerify = false;
  remoteJs.headerExpect = ['x-content-type-options: nosniff'];
  remoteCss.headerExpect = ['x-content-type-options: nosniff'];
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

console.log('Rollback-aware guarded release contract applied.');
