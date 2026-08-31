import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const registry = read('admin-menu-registry.js');
const sidebar = read('admin-sidebar.js');
const runtime = read('admin-menu-runtime.js');

if (!/id:\s*['"]tax['"][\s\S]{0,260}href:\s*['"]https:\/\/tax\.ekodi\.kr\/['"][\s\S]{0,160}adminHandoff:\s*true/.test(registry)) {
  throw new Error('tax admin handoff registry contract is missing');
}
if (!/definition\.href\s*\?\s*document\.createElement\(['"]a['"]\)/.test(sidebar)) {
  throw new Error('sidebar no longer pre-creates href-backed menu items');
}
if (!/function\s+bindAdminHandoff\s*\(/.test(runtime)) {
  throw new Error('admin handoff binder is missing');
}
if (!/let\s+link\s*=\s*nav\.querySelector\([\s\S]{0,180}data-section/.test(runtime)) {
  throw new Error('runtime does not reuse existing external menu links');
}
if (!/bindAdminHandoff\(link,\s*definition\)/.test(runtime)) {
  throw new Error('existing external menu links are not bound to admin handoff');
}
if (/!definition\?\.href\s*\|\|\s*nav\.querySelector\([\s\S]{0,120}\)\)\s*continue/.test(runtime)) {
  throw new Error('legacy skip-before-bind bug is still present');
}

console.log('OK admin menu handoff is bound for pre-rendered sidebar links.');
