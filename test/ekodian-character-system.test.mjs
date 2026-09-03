import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('EKODIAN encodes the shared identity and eight experience traits',async()=>{
  const source=await read('shell/character-system.js');
  for(const trait of ['proactive','personalized','future-oriented','relationship-oriented','context-aware','companion','restrained','life-giving']) assert.match(source,new RegExp(trait));
  assert.match(source,/name:'EKODIAN'/);assert.match(source,/koreanName:'에코디언'/);assert.match(source,/version:2/);
});
test('EKODIAN preserves user agency and provider independence',async()=>{
  const source=await read('shell/character-system.js');
  assert.match(source,/scrollIntoView/);assert.match(source,/focus\?\./);assert.doesNotMatch(source,/\.click\(/);assert.doesNotMatch(source,/openai|gemini|claude|anthropic/i);
});
test('Shared illustration and root homepage both bootstrap EKODIAN without changing service boundaries',async()=>{
  const [illustration,home,build]=await Promise.all([read('shell/illustration-system.js'),read('homepage-ambient.js'),read('scripts/build.mjs')]);
  assert.match(illustration,/data-ekodian-runtime/);assert.match(illustration,/installEkodian\(\)/);
  assert.match(home,/script\.src='\/character-system\.js'/);assert.match(home,/dataset\.ekodiService='ekodi'/);
  assert.match(build,/shell\/character-system\.js/);assert.match(build,/shell\/character/);
});
