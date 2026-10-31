import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const configs = [
  ['wrangler.my.toml','wrangler.my.staging.toml','my'],
  ['wrangler.life.toml','wrangler.life.staging.toml','life'],
  ['wrangler.energy.toml','wrangler.energy-staging.toml','energy'],
  ['wrangler.education.toml','wrangler.education.staging.toml','edu']
];

test('staging browser auth URL defaults match the approved apex production entrypoints',()=>{
  const oldHostname=['auth','ekodi','kr'].join('.');
  for(const [production,staging,site] of configs){
    const expected='https://ekodi.kr/auth/?site='+site;
    for(const path of [production,staging]){
      const config=read(path);
      const match=config.match(/^AUTH_URL = "([^"]+)"$/m);
      assert.ok(match,path+': missing authentication URL');
      assert.equal(match[1],expected,path+': must use central /auth/');
      assert.ok(!config.includes('https://'+oldHostname+'/?site='+site),path+': legacy login target');
    }
  }
});

test('staging auth migration leaves isolated execution and disabled test data settings intact',()=>{
  const my=read('wrangler.my.staging.toml');
  const life=read('wrangler.life.staging.toml');
  const energy=read('wrangler.energy-staging.toml');
  const education=read('wrangler.education.staging.toml');
  assert.match(my,/DATA_ENABLED = "false"/);
  assert.match(my,/DATA_MODE = "isolated-staging"/);
  assert.match(life,/name = "ekodi-life-ai-staging"/);
  assert.match(energy,/name = "ekodi-energy-staging"/);
  assert.match(education,/name = "ekodi-education-staging"/);
});
