import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';

const renderer=readFileSync(new URL('../bible/devotion.js',import.meta.url),'utf8');
const stylesheet=readFileSync(new URL('../bible/devotion.css',import.meta.url),'utf8');

test('shared Bible, Church and Mission devotional tabs prioritize prayer, not score or picture',()=>{
  const ids=[...renderer.matchAll(/^\s*\{ id: '([^']+)', label: '([^']+)' \},$/gm)]
    .map(([,id,label])=>({id,label}));
  assert.deepEqual(ids.map(item=>item.id),['poem','song','prayer','questions','family','records']);
  assert.equal(ids.find(item=>item.id==='prayer')?.label,'묵상기도');
  assert.equal(ids.find(item=>item.id==='song')?.label,'묵상 노래');
  assert.match(renderer,/panelHead\(panel,'묵상기도','prayer'\)/);
  assert.match(renderer,/panel\.append\(el\('p','dv-prayer',a\.prayer\)\)/);
  assert.match(renderer,/panel\.append\(verse,refrain\)/,'song lyrics remain');
  assert.match(renderer,/case 'prayer': return \{ title: '묵상기도'/);
  assert.doesNotMatch(renderer,/renderDevotionScore|renderDailyDevotionArt|dailyDevotionMelody|dv-score/);
  assert.doesNotMatch(renderer,/panels\.get\('image'\)|id: 'image'|case 'image':/);
  assert.doesNotMatch(renderer,/\['song\.abc'|\['illustration\.src'|\['illustration\.alt'/);
  assert.match(renderer,/image:'prayer'/,'old image links navigate to prayer');
  assert.doesNotMatch(stylesheet,/\.dv-daily-art/);
});

class FakeElement{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.value='';this.disabled=false;this.hidden=false;this.textContent='';this.className='';}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(type,cb){this.listeners[type]=cb}
 click(){this.listeners.click?.()}
}
test('read-aloud screen retains simple voice selector, listen and accessible advanced settings',()=>{
 const win={addEventListener:()=>{},speechSynthesis:{getVoices:()=>[],speak:()=>{},cancel:()=>{}},SpeechSynthesisUtterance:class{}};
 const ui=createDevotionSpeechUI(win,{createElement:tag=>new FakeElement(tag)});
 const row=ui.element;
 assert.equal(row.dataset.advanced,'false');
 const controls=row.children.filter(el=>el.dataset?.speechAction).map(el=>el.dataset.speechAction);
 assert.deepEqual(controls,['play','pause','repeat','stop','loop','settings']);
 const loop=row.children.find(el=>el.dataset?.speechAction==='loop');
 assert.equal(loop.attributes['aria-pressed'],'false');
 const settings=row.children.at(-1);
 settings.click();
 assert.equal(row.dataset.advanced,'true');
 assert.equal(settings.attributes['aria-expanded'],'true');
 settings.click();
 assert.equal(row.dataset.advanced,'false');
 assert.equal(settings.attributes['aria-expanded'],'false');
});
