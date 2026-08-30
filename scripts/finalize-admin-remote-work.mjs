import fs from 'node:fs';

function replaceIfNeeded(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`${path}: anchor not found`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceIfNeeded(
  'scripts/admin-performance-postbuild.mjs',
  "  'campus-actions.js','campus-actions.css','device-control-admin.js','device-control-admin.css',",
  "  'campus-actions.js','campus-actions.css','device-control-admin.js','device-control-admin.css','remote-power-admin.js','remote-power-admin.css',"
);

replaceIfNeeded(
  'test/device-control-contract.test.mjs',
  '  assert.match(admin, /통합 기기관리/);',
  '  assert.match(admin, /원격 작업/);'
);

const thinPath = 'test/admin-thin-shell.test.mjs';
let thin = fs.readFileSync(thinPath, 'utf8');
if (!thin.includes("const perfPostbuild = await read('scripts/admin-performance-postbuild.mjs');")) {
  const testAnchor = "test('postbuild emits a purpose-built minimal compact runtime and strips legacy Admin chrome', async () => {\n  const pkg = JSON.parse(await read('package.json'));\n  const postbuild = await read('scripts/admin-thin-postbuild.mjs');";
  if (!thin.includes(testAnchor)) throw new Error('thin-shell postbuild test anchor missing');
  thin = thin.replace(testAnchor, `${testAnchor}\n  const perfPostbuild = await read('scripts/admin-performance-postbuild.mjs');`);
}
if (!thin.includes('assert.match(perfPostbuild, /remote-power-admin\\.js/);')) {
  const assertAnchor = "  assert.match(postbuild, /writeFile\\(\`\\$\\{dist\\}remote-power-admin\\.css\`/);";
  if (!thin.includes(assertAnchor)) throw new Error('thin-shell remote-power assertion anchor missing');
  thin = thin.replace(assertAnchor, `${assertAnchor}\n  assert.match(perfPostbuild, /remote-power-admin\\.js/);\n  assert.match(perfPostbuild, /remote-power-admin\\.css/);`);
}
fs.writeFileSync(thinPath, thin);

console.log('Remote work fingerprint and contracts finalized.');
