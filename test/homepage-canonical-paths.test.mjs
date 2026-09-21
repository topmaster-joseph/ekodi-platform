import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
const router=await readFile(new URL('../canonical-surface-router.js',import.meta.url),'utf8');
const wrangler=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');

test('public homepage live services use canonical ekodi.kr paths',()=>{
  const publicLive=registry.services.filter(service=>service.productionVerified===true&&service.status==='live');
  for(const service of publicLive){
    const url=new URL(service.url);
    assert.equal(url.hostname,'ekodi.kr',`${service.id} must use the canonical apex host`);
    assert.match(service.label,/^ekodi\.kr(?:\/|$)/,`${service.id} label must show the canonical apex path`);
  }
});

test('migrated homepage services are direct service-binding surfaces, not redirects',()=>{
  const specs=[
    ['books','/books','BOOKS'],
    ['publishing','/publishing','PUBLISHING'],
    ['journal','/journal','JOURNAL'],
    ['author','/author','AUTHOR'],
    ['life','/life','LIFE'],
    ['space','/space','SPACE'],
    ['work','/work','WORK'],
  ];
  for(const [id,prefix,binding] of specs){
    assert.match(router,new RegExp(`id:'${id}',prefix:'${prefix}',binding:'${binding}'`));
    assert.match(wrangler,new RegExp(`binding = "${binding}"[\\s\\S]*?service = `));
  }
});
