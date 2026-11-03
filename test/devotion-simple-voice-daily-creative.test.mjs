import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dailyDevotionMelody,dailyDevotionArtSpec,renderDailyDevotionArt} from '../bible/devotion-daily-creative.js';
import {createDevotionSpeechUI} from '../bible/devotion-speech-ui.js';

const source=readFileSync(new URL('../bible/devotion.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../bible/devotion.css',import.meta.url),'utf8');

test('daily score is an original, deterministic eight-bar melody for the published date',()=>{
 const input={date:'2026-11-03',passage:'고린도전서 4:1-13',theme:'주님의 사랑과 나눔',title:'주님의 길'};
 const abc=dailyDevotionMelody(input);
 assert.equal(abc,dailyDevotionMelody(input),'repeat view is stable');
 assert.match(abc,/^X:1\nT:주님의 길\nM:4\/4\nL:1\/4\nK:C\n/);
 const bars=abc.split('K:C\n')[1].split('|').map(x=>x.trim()).filter(Boolean);
 assert.equal(bars.length,8);
 for(const bar of bars){
   const tokens=bar.split(/\s+/);
   assert.ok(tokens.length>=3 && tokens.length<=4);
   assert.equal(tokens.reduce((sum,token)=>{
     assert.match(token,/^[A-Ga-g][,']*[0-9]*$/);
     return sum+Number(token.match(/[0-9]+$/)?.[0]||1);
   },0),4,'each bar is precisely 4/4');
 }
 assert.match(bars.at(-1),/ C2$/,'ending lands on a held tonic');
 assert.notEqual(abc,dailyDevotionMelody({...input,date:'2026-11-04'}),'daily tune changes');
 assert.match(dailyDevotionMelody({...input,theme:'십자가의 고난'}),/\nK:Am\n/);
 assert.equal(dailyDevotionMelody({...input,date:'2026-02-30'}),null);
 assert.equal(dailyDevotionMelody({...input,date:'2030-13-03'}),null);
});

class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.listeners={};this.dataset={};this.hidden=false;this.value='';this.disabled=false;this.textContent='';this.className='';}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 setAttribute(k,v){this.attributes[k]=v}
 addEventListener(event,cb){this.listeners[event]=cb}
 click(){this.listeners.click?.()}
}
const doc={createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
function tree(node){return {tag:node.tagName,attrs:node.attributes,text:node.textContent,children:node.children.map(tree)}}

test('simple daily illustration is date-specific, theme-aware and first-party inline SVG',()=>{
 const base={date:'2026-11-03',theme:'나눔과 사랑',passage:'고린도전서'};
 const one=dailyDevotionArtSpec(base);
 assert.equal(one.semantic,'together');
 assert.deepEqual(one,dailyDevotionArtSpec(base));
 const another=dailyDevotionArtSpec({...base,date:'2026-11-04'});
 assert.notDeepEqual(one,another);
 assert.equal(dailyDevotionArtSpec({...base,date:'2026-02-30'}),null);
 assert.equal(dailyDevotionArtSpec({...base,theme:'나무와 열매'}).semantic,'sprout');
 assert.equal(dailyDevotionArtSpec({...base,theme:'생명의 강'}).semantic,'water');
 const host=new Node('div');
 const svg=renderDailyDevotionArt(host,base,doc);
 assert.equal(svg.tagName,'svg');
 assert.equal(svg.attributes['data-art-date'],base.date);
 assert.equal(svg.attributes['data-art-motif'],'together');
 assert.equal(svg.attributes.role,'img');
 assert.match(svg.attributes['aria-label'],/2026-11-03/);
 assert.equal(host.children.length,1);
 assert.ok(svg.children.length>=5);
 const serialized=JSON.stringify(tree(svg));
 assert.equal(svg.attributes.xmlns,'http://www.w3.org/2000/svg');
 assert.doesNotMatch(serialized.replace('http://www.w3.org/2000/svg',''),/<script|javascript:|https?:\/\//i);
 const invalidHost=new Node('div');
 assert.equal(renderDailyDevotionArt(invalidHost,{date:'2026-02-30'},doc),null);
 assert.equal(invalidHost.children.length,0);
});

test('published devotion omits score and picture tabs while preserving prayer',()=>{
 assert.doesNotMatch(source,/import \{ dailyDevotionMelody, renderDailyDevotionArt \}/);
 assert.doesNotMatch(source,/\{ id: '(song|image)',/);
 assert.match(source,/\{ id: 'prayer', label: '묵상기도' \}/);
 assert.match(source,/panelHead\(panel,'묵상기도','prayer'\)/);
});

test('voice setup collapses advanced selectors behind accessible toggle without removing audio actions',()=>{
 const win={
   addEventListener:()=>{},speechSynthesis:{speak:()=>{},cancel:()=>{},getVoices:()=>[]},
   SpeechSynthesisUtterance:class{constructor(text){this.text=text}},
 };
 const ui=createDevotionSpeechUI(win,doc),row=ui.element;
 assert.equal(row.dataset.advanced,'false');
 assert.equal(row.children.length,10);
 const controls=row.children.filter(n=>n.dataset?.speechAction).map(n=>n.dataset.speechAction);
 assert.deepEqual(controls,['play','pause','repeat','stop','settings']);
 const settings=row.children.at(-1);
 assert.equal(settings.attributes['aria-expanded'],'false');
 settings.click();
 assert.equal(row.dataset.advanced,'true');
 assert.equal(settings.attributes['aria-expanded'],'true');
 assert.equal(settings.textContent,'설정 닫기');
 settings.click();
 assert.equal(row.dataset.advanced,'false');
 assert.equal(settings.textContent,'음성 설정');
 assert.match(css,/data-advanced="false".*dv-speech-engine/);
 assert.match(css,/data-advanced="false".*\[data-speech-action="repeat"\]/);
});


test('all 30 published November devotional entries receive a distinctive daily art and composed score',()=>{
 const registry=JSON.parse(readFileSync(new URL('../config/devotional-activities/2026-11.json',import.meta.url),'utf8'));
 assert.equal(registry.days.length,30);
 const artKeys=new Set(),melodies=new Set();
 for(const item of registry.days){
   const date='2026-11-'+String(item.day).padStart(2,'0');
   const input={date,passage:item.passage,theme:item.theme,title:item.song?.title||''};
   const score=dailyDevotionMelody(input),spec=dailyDevotionArtSpec(input);
   assert.ok(score, 'score missing for '+date);
   assert.ok(spec, 'art missing for '+date);
   artKeys.add(spec.seed);
   melodies.add(score.split('\n').slice(5).join('|'));
 }
 assert.equal(artKeys.size,30,'every date has unique art parameters');
 assert.ok(melodies.size>=26,'tunes do not collapse to a repeated template');
});
