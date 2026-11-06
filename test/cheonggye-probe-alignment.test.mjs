import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {localRegionBySlug} from '../local-region-registry.js';
import {localRegionPublicPage} from '../local-region-page.js';
import {regionalCommerceProgramById} from '../regional-commerce-program-registry.js';
import {regionalCommerceProgramPublicPage} from '../regional-commerce-program-page.js';
import {regionTabsScriptResponse} from '../region-tabs-ui.js';

test('Cheonggye and Pass production canaries check the actual current public renderers',async()=>{
  const manifest=JSON.parse(await fs.readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const region=localRegionBySlug('cheonggye');
  const pass=regionalCommerceProgramById('cheonggye-pass');
  const cases=[
    ['https://ekodi.kr/cheonggye',await localRegionPublicPage(region)],
    ['https://ekodi.kr/cgpass',await regionalCommerceProgramPublicPage(region,pass)],
    ['https://ekodi.kr/cheonggye/region-tabs-ui.js',regionTabsScriptResponse()],
  ];
  for(const [url,response] of cases){
    const probe=manifest.worker.requests.find(item=>item.url===url);
    assert.ok(probe,'missing real-production canary '+url);
    assert.equal(response.status,200);
    const body=await response.text();
    for(const needle of probe.expect||[])assert.ok(body.includes(needle),'stale production marker '+url+': '+needle);
    for(const header of probe.headerExpect||[]){
      const pos=header.indexOf(':');
      assert.ok(pos>0,'invalid header contract '+header);
      const name=header.slice(0,pos).trim();
      const expectation=header.slice(pos+1).trim();
      // Shell-injected headers are asserted in the existing Worker/router tests,
      // while raw response headers can be checked here directly.
      if(name==='x-ekodi-shell')continue;
      const actual=response.headers.get(name);
      assert.ok(actual&&actual.toLowerCase().includes(expectation.toLowerCase()),url+' header '+header);
    }
  }
});
