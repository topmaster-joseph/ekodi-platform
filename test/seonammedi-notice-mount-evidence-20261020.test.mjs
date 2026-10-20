import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const read=path=>readFile(new URL('../sites/seonammedi/public/'+path,import.meta.url),'utf8');

// 2026-10-20 incident: on ekodi.kr/seonammedi/ the featured notice card linked to
// ekodi.kr/notices/11 (EKODI operating-space page) because the permalink ignored the mount.
function permalinkFor(origin,pathname,app){
  const fn=app.match(/function siteMountBase\(\)\{[^\n]*?\}\n?/)?.[0]||'';
  const perm=app.match(/function noticePermalink\(id\)\{[^\n]*?\}/)?.[0]||'';
  assert.ok(fn&&perm,'helpers must exist');
  const ctx={location:{origin,pathname},encodeURIComponent};
  vm.runInNewContext(fn.replace(/\n$/,'')+'\n'+perm+'\nresult=noticePermalink(11);',ctx);
  return ctx.result;
}

test('notice permalink keeps the /seonammedi mount on ekodi.kr',async()=>{
  const app=await read('app.js');
  assert.equal(permalinkFor('https://ekodi.kr','/seonammedi/',app),'https://ekodi.kr/seonammedi/notices/11');
  assert.equal(permalinkFor('https://ekodi.kr','/seonammedi/notices/3',app),'https://ekodi.kr/seonammedi/notices/11');
  assert.equal(permalinkFor('https://seonammedi.kr','/',app),'https://seonammedi.kr/notices/11');
  assert.doesNotMatch(app,/location\.origin\+'\/notices\//);
  assert.doesNotMatch(app,/location\.replace\('\/notices\/'\)/);
});

test('notice list page links are mount-aware',async()=>{
  const page=await read('notices/index.html');
  assert.doesNotMatch(page,/<a href="\/notices\/'\+x\.id/);
  assert.match(page,/startsWith\('\/seonammedi\/'\)\?'\/seonammedi':''/);
});

test('auto evidence row goes into the collapsible detail, never the collapsed title row',async()=>{
  const app=await read('app.js'),css=await read('app.css');
  assert.match(app,/card\.querySelector\('\.timeline-detail'\)\|\|card\.querySelector/);
  assert.match(css,/\.timeline-item\.is-collapsed \.auto-evidence-row\{display:none!important\}/);
  assert.match(css,/\.timeline-item \.auto-evidence-row\{flex:1 1 100%/);
});

test('cache-busting version bumped on every seonammedi page that loads app.js',async()=>{
  for(const page of ['index.html','notices/index.html','finance/index.html','minutes/index.html']){
    const html=await read(page);
    if(/\/seonammedi\/app\.js\?v=/.test(html))assert.match(html,/app\.js\?v=20261013-section-add-1020/,page);
  }
});
