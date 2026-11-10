import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {header,footer,SITES,plan} from '../scripts/site-chrome.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const MARKS={
 books:'M9 15 Q21 10 32 21',
 publishing:'M17 10 H40 L49 19'
};

test('books and publishing have independent, self-contained monochrome CI in both shared masthead and footer',()=>{
 for(const [id,mark] of Object.entries(MARKS)){
  const head=header(id),foot=footer(id);
  for(const html of [head,foot]){
    assert.match(html,/<svg width="25" height="25" viewBox="0 0 64 64" fill="none" focusable="false">/);
    assert.ok(html.includes(mark));
    assert.match(html,/stroke="currentColor"/);
    assert.doesNotMatch(html,/<(?:image|foreignObject|script)\b|EKODI®/i);
    assert.ok(html.includes(SITES[id].name));
  }
  assert.notEqual(MARKS.books,MARKS.publishing);
 }
});
test('all 20 generated HTML source pages retain exact generator chrome and both local CI marks',()=>{
 const generated=plan();
 for(const id of ['books','publishing']){
  assert.equal(SITES[id].pages.length,10);
  const marker=MARKS[id];
  for(const p of SITES[id].pages){
   const html=read(p);
   assert.ok(html.includes(marker),p);
   assert.equal((html.match(/<svg width="25" height="25" viewBox="0 0 64 64"/g)||[]).length,2,p);
   assert.equal(html,generated.get(p),p+' generator mismatch');
  }
 }
});
