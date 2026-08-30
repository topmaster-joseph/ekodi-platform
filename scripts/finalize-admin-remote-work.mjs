import fs from 'node:fs';

function replace(path, before, after) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${path}: anchor not found`);
  fs.writeFileSync(path, source.replace(before, after));
}

replace(
  'scripts/admin-performance-postbuild.mjs',
  "  'campus-actions.js','campus-actions.css','device-control-admin.js','device-control-admin.css',",
  "  'campus-actions.js','campus-actions.css','device-control-admin.js','device-control-admin.css','remote-power-admin.js','remote-power-admin.css',"
);

replace(
  'test/device-control-contract.test.mjs',
  '  assert.match(admin, /통합 기기관리/);',
  '  assert.match(admin, /원격 작업/);'
);

const thinPath = 'test/admin-thin-shell.test.mjs';
let thin = fs.readFileSync(thinPath, 'utf8');
if (!thin.includes('remote-power-admin.js')) throw new Error('thin-shell remote-power contract missing');
if (!thin.includes("readFile(new URL('../scripts/admin-performance-postbuild.mjs'")) {
  const importAnchor = "const postbuild = await readFile(new URL('../scripts/admin-thin-postbuild.mjs', import.meta.url), 'utf8');";
  if (!thin.includes(importAnchor)) throw new Error('thin-shell postbuild reader anchor missing');
  thin = thin.replace(importAnchor, `${importAnchor}\n  const perfPostbuild = await readFile(new URL('../scripts/admin-performance-postbuild.mjs', import.meta.url), 'utf8');`);
  const assertAnchor = "  assert.match(postbuild, /writeFile\\(\`\\$\\{dist\\}remote-power-admin\\.css\`/);";
  if (!thin.includes(assertAnchor)) throw new Error('thin-shell remote-power asset assertion missing');
  thin = thin.replace(assertAnchor, `${assertAnchor}\n  assert.match(perfPostbuild, /remote-power-admin\\.js/);\n  assert.match(perfPostbuild, /remote-power-admin\\.css/);`);
  fs.writeFileSync(thinPath, thin);
}

console.log('Remote work fingerprint and contracts finalized.');
