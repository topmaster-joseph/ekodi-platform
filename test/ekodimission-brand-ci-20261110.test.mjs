import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('mission homepage retains independent identity, preview state and activity while showing own CI',async()=>{
 const [page,css]=await Promise.all([read('space/ekodimission.page'),read('space/ekodimission-shell.css')]);
 assert.match(page,/class="mission-brand" href="\/ekodimission"/);
 assert.match(page,/data-mission-ci="open-table" aria-hidden="true"/);
 assert.match(page,/<svg viewBox="0 0 64 64" fill="none" focusable="false">/);
 assert.match(page,/에코디선교회<\/strong><small>EKODI MISSION<\/small>/);
 assert.match(page,/noindex,nofollow,noarchive/);
 assert.match(page,/<strong>PREVIEW<\/strong>/);
 for(const item of ['data-mission-nav','data-mission-tabs="home"','data-mission-saturday','data-mission-participation'])assert.ok(page.includes(item));
 assert.match(css,/\.mission-brand-mark\[data-mission-ci="open-table"\] svg/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.ok(!page.includes('EKODI®'));
});
test('mission local CI remains home-only and preserves other site identities',async()=>{
 const [root,church,bbq]=await Promise.all([
  read('space/ekodimission.page'),read('sites/ekodi-church/index.html'),read('docs/brand/rights/ekodi-ip-registry.json')
 ]);
 assert.ok(root.includes('data-mission-ci'));
 assert.ok(!church.includes('data-mission-ci'));
 assert.equal(JSON.parse(bbq).governance.noFranchiseBrandWithoutOwnerLicense,true);
});
