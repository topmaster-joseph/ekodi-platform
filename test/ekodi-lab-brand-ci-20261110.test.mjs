import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const path=new URL('../sites/ekodi-lab/index.html',import.meta.url);
test('EKODI Lab keeps its own evidence/connection CI and research home identity',async()=>{
 const s=await readFile(path,'utf8');
 assert.match(s,/<a class="brand" href="#top"><span class="mark" data-lab-ci="evidence-path" aria-hidden="true">/);
 assert.match(s,/<svg viewBox="0 0 64 64" fill="none" focusable="false">/);
 assert.match(s,/에코디연구소<small>EKODI LAB<\/small>/);
 assert.match(s,/.mark\[data-lab-ci="evidence-path"\] svg/);
 for(const value of ['href="#about"','href="#research"','href="#projects"','href="#archive"','href="#contact"'])assert.ok(s.includes(value));
 assert.match(s,/<link rel="canonical" href="https:\/\/ekodi\.kr\/ekodilab"/);
 assert.ok(!s.includes('EKODI®'));
 assert.doesNotMatch(s,/<(?:image|foreignObject|script)\b[^>]*data-lab-ci/);
});
