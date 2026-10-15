import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const worker=read('scripts/admin-authenticated-e2e-menu-worker.mjs');
const lifecycle=JSON.parse(read('config/site-lifecycle-registry.json'));
const constitution=JSON.parse(read('governance/constitution/constitution.json'));

test('signed-in CGMA admin E2E checks the official canonical workspace path, not only its old custom domain',()=>{
  const site=lifecycle.existingWorkspaceSites.find(item=>item.id==='cgma');
  assert.ok(site,'CGMA must remain registered');
  assert.equal(site.canonicalUrl,'https://ekodi.kr/cgma');
  assert.ok(site.customDomains.includes('https://cgma.or.kr'));
  assert.equal(constitution.customerOwnedDomainMappings['cgma.or.kr'],site.canonicalUrl);
  const expected=new URL(site.canonicalUrl);
  const display=expected.host+expected.pathname;
  assert.ok(worker.includes("domainText.includes('"+display+"')"),'authenticated browser must check currently displayed canonical path');
  assert.ok(worker.includes('form[data-public-site-id="cgma"]'),'must retain real CGMA form assertion');
  assert.ok(worker.includes("response.status !== 200"),'must keep live API authentication success required');
  assert.ok(worker.includes('publicStatus'), 'must retain public-status checks');
  assert.ok(worker.includes('maintenanceDisplayType'), 'must retain maintenance mode checks');
  assert.ok(worker.includes('redirectMode'), 'must retain redirect checks');
});
