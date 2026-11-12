import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const legacy='에코디언의 묵상나눔';

test('mission and Bible public social preview no longer contain old sharing title',async()=>{
 const [mission,bible,worker]=await Promise.all([
  read('space/ekodimission-devotion.page'),
  read('bible/devotion.html'),
  read('bible-worker.js'),
 ]);
 for(const [name,source] of [['mission',mission],['bible',bible],['worker',worker]]){
  assert.ok(!source.includes(legacy),name+' retains legacy social sharing title');
 }
 assert.match(mission,/<meta property="og:title" content="에코디">/u);
 assert.match(mission,/<meta property="og:site_name" content="에코디">/u);
 assert.match(bible,/<title>에코디<\/title>/u);
 assert.match(worker,/<meta property="og:site_name" content="에코디"/u);
});

test('Bible staging and production smoke gates expect new exact OG title',async()=>{
 const source=await read('.github/workflows/deploy-bible.yml');
 assert.ok(!source.includes(legacy));
 const marker='og:title" content="에코디"';
 assert.equal(source.split(marker).length,3,'staging and production should both check new OG title');
});
