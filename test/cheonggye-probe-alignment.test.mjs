import { cheonggyePublicHoldResponse } from '../region-publication-hold.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {localRegionBySlug} from '../local-region-registry.js';
import {localRegionPublicPage} from '../local-region-page.js';
import {regionalCommerceProgramById} from '../regional-commerce-program-registry.js';
import {regionalCommerceProgramPublicPage} from '../regional-commerce-program-page.js';
import {regionTabsScriptResponse} from '../region-tabs-ui.js';

test('private Cheonggye and Pass production canaries enforce owner hold',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  for(const url of ['https://ekodi.kr/cheonggye','https://ekodi.kr/cgpass','https://ekodi.kr/cheonggye/region-tabs-ui.js']){
    const probe=manifest.worker.requests.find(item=>item.url===url);
    assert.ok(probe,'missing real-production private canary '+url);
    const response=cheonggyePublicHoldResponse(new Request(url));
    assert.equal(response.status,404);
    assert.deepEqual(probe.statuses,[404]);
    const body=await response.text();
    for(const needle of probe.expect||[])assert.ok(body.includes(needle),'stale production marker '+url+': '+needle);
    for(const marker of probe.forbid||[])assert.equal(body.includes(marker),false,'private body must not contain '+marker);
    for(const header of probe.headerExpect||[]){
      const pos=header.indexOf(':');
      assert.ok(pos>0,'invalid header contract '+header);
      const name=header.slice(0,pos).trim(),expectation=header.slice(pos+1).trim();
      const actual=response.headers.get(name);
      assert.ok(actual&&actual.toLowerCase().includes(expectation.toLowerCase()),url+' header '+header);
    }
  }
});
