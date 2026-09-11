import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('production routers expose Learning Fabric paths', () => {
  const site=fs.readFileSync(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  const api=fs.readFileSync(new URL('../mission-control-entry-worker.js',import.meta.url),'utf8');
  const wrangler=fs.readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(site,/isLearningPath/);
  assert.match(site,/learningPage\(\)/);
  assert.match(api,/handleLearningControl/);
  assert.match(wrangler,/"\/learn\*"/);
});

test('Learning Fabric is canonical at /learn without replacing Education', () => {
  const manifest=fs.readFileSync(new URL('../ekodi-service-manifest.js',import.meta.url),'utf8');
  const catalog=JSON.parse(fs.readFileSync(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
  assert.match(manifest,/id:'edu'.*https:\/\/edu\.ekodi\.kr\//);
  assert.match(manifest,/id:'learn'.*https:\/\/ekodi\.kr\/learn/);
  const edu=catalog.services.find(item=>item.id==='edu');
  const learn=catalog.services.find(item=>item.id==='learn');
  assert.equal(edu.url,'https://edu.ekodi.kr');
  assert.equal(learn.url,'https://ekodi.kr/learn');
  assert.equal(learn.productionVerified,true);
  assert.equal(learn.status,'live');
});
test('learning auth alias returns members to canonical /learn', () => {
  const auth=fs.readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
  const page=fs.readFileSync(new URL('../learning-page.js',import.meta.url),'utf8');
  assert.match(auth,/learn:\{name:'EKODI Learning Fabric'/);
  assert.match(auth,/returnTo:'https:\/\/ekodi\.kr\/learn'/);
  assert.match(auth,/operatingModel:'public-service'/);
  assert.match(page,/site=learn&return_to=https%3A%2F%2Fekodi\.kr%2Flearn/);
});