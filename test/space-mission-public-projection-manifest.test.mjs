import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { missionPublicReferences } from '../mission-public-path.js';
import { missionPageEntries, validateMissionManifest, REQUIRED_SHELL_MARKERS } from '../scripts/validate-ekodimission-shell-contract.mjs';

test('guarded Space manifest checks the actual canonical Mission response, not stale source paths',async()=>{
  const [raw,worker]=await Promise.all([
    readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'),
    readFile(new URL('../space-worker.js',import.meta.url),'utf8')
  ]);
  const manifest=JSON.parse(raw);
  assert.equal(missionPublicReferences('/ekodimission/assets/shell.css'),'/mission/assets/shell.css');
  assert.equal(missionPublicReferences('/ekodimission/apply/260926-open-table'),'/mission/apply/260926-open-table');
  const entries=missionPageEntries(worker);
  assert.ok(entries.length>=10);
  assert.equal(validateMissionManifest(manifest,entries),true);
  const requests=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/ekodimission'));
  assert.ok(requests.length>=entries.length);
  for(const {url,expect=[]} of requests){
    for(const token of expect){
      assert.equal(token,missionPublicReferences(token),'stale runtime response marker at '+url+': '+token);
    }
    if(expect.includes('class="mission-site-header"')){
      for(const token of REQUIRED_SHELL_MARKERS){
        assert.ok(expect.includes(missionPublicReferences(token)),'missing required canonical marker at '+url);
      }
    }
  }
  assert.ok(requests.some(item=>item.url==='https://ekodi.kr/ekodimission'&&item.expect.includes('/mission/assets/shell.css')));
  const bbq=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/bbqcg'));
  assert.equal(bbq.length,0,'no new unsafe BBQ checkout canary introduced');
});
