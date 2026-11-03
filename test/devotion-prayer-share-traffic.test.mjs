import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatDevotionShareMessage,devotionShareExcerpt} from '../bible/devotion-share-audio.js';

const source=readFileSync(new URL('../bible/devotion.js',import.meta.url),'utf8');
const footer=readFileSync(new URL('../shell/user-ui-footer.js',import.meta.url),'utf8');
const date='2026-11-03',url='https://ekodi.kr/ekodimission/devotion?date=2026-11-03#prayer';

test('public devotional tabs contain prayer but omit song, score and picture',()=>{
 for(const section of ['poem','questions','family','prayer','records'])
  assert.match(source,new RegExp("\\{ id: '"+section+"',"));
 for(const unused of ['song','image'])assert.doesNotMatch(source,new RegExp("\\{ id: '"+unused+"',"));
 assert.match(source,/\{ id: 'prayer', label: '묵상기도' \}/);
 assert.match(source,/panelHead\(panel,'묵상기도','prayer'\)/);
 assert.doesNotMatch(source,/setupMrPlayer|renderDevotionScore|renderDailyDevotionArt|renderDailyDevotionScore/);
 assert.doesNotMatch(source,/\['song\.abc',|\['illustration\.src',/);
 assert.match(source,/\['prayer','묵상기도 · 기도문','textarea'\]/);
});

test('share format does not repeat matching title and body phrases',()=>{
 const title='에코디선교회 오늘의 매일묵상 · 묵상기도';
 const same=formatDevotionShareMessage({date,title,excerpt:title,url});
 const lines=same.split('\n');
 assert.equal(lines.length,3,'no duplicate excerpt line');
 assert.equal(lines[1],title);
 assert.equal(lines[2],url);
 assert.equal(same.split(url).length-1,1);
 const contained=formatDevotionShareMessage({date,title,excerpt:'묵상기도',url});
 assert.equal(contained.split('\n').length,3);
 const repeatedTitle=formatDevotionShareMessage({date,title:'묵상기도',excerpt:'묵상기도',url});
 assert.equal(repeatedTitle.split('\n').length,3);
 const distinct=formatDevotionShareMessage({date,title,excerpt:'주님, 주신 말씀을 살아내게 하소서.',url});
 assert.equal(distinct.split('\n').length,4,'genuinely different sentence is retained');
 assert.match(distinct,/주님, 주신 말씀을 살아내게 하소서\./);
 assert.equal(distinct.split(url).length-1,1);
 assert.throws(()=>formatDevotionShareMessage({date,title,excerpt:'hi',url:'https://evil.test/'}),/invalid_devotion_url/);
});

test('shared footer uses separated, responsive visit statistics with enough label/value spacing',()=>{
 assert.match(footer,/\.ekodi-footer-traffic\{[^}]*gap:8px 20px!important/);
 assert.match(footer,/\.ekodi-footer-traffic__metric\{[^}]*gap:6px!important/);
 assert.match(footer,/@media\(max-width:390px\)\{\.ekodi-footer-traffic\{gap:7px 14px!important/);
 assert.match(footer,/flex-wrap:wrap!important/);
 assert.match(footer,/addTrafficMetric\(node/);
});
