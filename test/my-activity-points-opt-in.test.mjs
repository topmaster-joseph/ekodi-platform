import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('my/app.js'),html=read('my/index.html');
const core=read('points-active-client.js'),copy=read('my/points-active-client.js');
test('My EKODI activity page only tracks explicit consent on its activity tab',()=>{
  assert.match(html,/id="activityPointsControls"[^>]*hidden/);
  assert.match(html,/id="activityPointsOptIn" type="checkbox"/);
  assert.match(app,/cfg\.pointsEnabled===true && enabled/);
  assert.match(app,/siteId:'my'/);
  assert.match(app,/toggle\.checked&&location\.hash==='#activity'/);
  assert.match(app,/document\.visibilityState==='visible'/);
  assert.match(app,/myPointsTracker\.stop\(\)/);
  assert.match(app,/event==='SIGNED_OUT'/);
  assert.match(app,/window\.addEventListener\('pagehide'/);
  assert.doesNotMatch(app,/localStorage\.setItem\('activityPointsOptIn'/);
});
test('My bundled tracker is byte-identical to EKODI public shared source',()=>{
  assert.equal(copy,core);
  assert.match(app,/from '\.\/points-active-client\.js'/);
});
