import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const [layout,health,registry]=await Promise.all([
 readFile(new URL('../admin-menu-layout.js',import.meta.url),'utf8'),
 readFile(new URL('../system-health-admin.js',import.meta.url),'utf8'),
 readFile(new URL('../admin-menu-registry.js',import.meta.url),'utf8')
]);

test('architecture menu uses existing health demand loader, not an undefined feature',()=>{
 assert.match(registry,/id:\s*'architecture',\s*group:\s*'status'/);
 assert.match(layout,/\['architecture','health'\]/);
 assert.match(layout,/\['health','health'\]/);
 assert.match(layout,/const demandKey=DEMAND_KEYS.get\(section\)/);
 assert.match(layout,/window\.EKODIAdminDemand\.activate\(demandKey\)/);
});
test('health panel also resolves architecture, retaining independent navigation URL',()=>{
 assert.match(health,/const SECTION\s*=\s*'health'/);
 assert.match(health,/section\.dataset\.panel\s*=\s*`\$\{SECTION\} platform-overview`/);
 assert.match(health,/section\.dataset\.panel \+= ' architecture'/);
 assert.match(layout,/if\(!activatePanel\(section\)\)requestDemand\(section\)/);
 assert.match(layout,/requestedSection=section;return activatePanel\(section\)\|\|requestDemand\(section\)/);
 assert.match(layout,/current:\(\)=>requestedSection/);
 assert.match(layout,/#architecture:architecture/);
});
test('compact Admin menu contains the same alias and exact source integrity hash',async()=>{
 const compact=await readFile(new URL('../admin-menu-layout.compact.js',import.meta.url),'utf8');
 assert.match(compact,/\["health","health"\],\["site-health","site-health"\],\["architecture","health"\]/);
 const expected=createHash('sha256').update(layout.replace(/\r\n/g,'\n')).digest('hex');
 assert.match(compact,new RegExp('^// source-sha256:'+expected));
});
test('system overview remains a single shared panel, not duplicated',()=>{
 assert.equal((health.match(/document\.createElement\('section'\)/g)||[]).length,1);
 assert.doesNotMatch(layout,/architecture.*window\.location\.assign/);
});
