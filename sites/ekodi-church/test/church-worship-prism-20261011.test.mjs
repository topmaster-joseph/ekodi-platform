import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../worship/2026-10-11/'+name,import.meta.url),'utf8');
const html=read('index.html');
const css=read('worship.css');
const js=read('worship.js');

test('October 11 published packet is reachable as canonical church path with print bulletin',()=>{
  assert.match(html,/ekodi\.kr\/ekodichurch\/worship\/2026-10-11\//);
  assert.match(html,/신명기 31:9–18/);
  assert.match(html,/대표기도<\/span><small>박은희/);
  assert.match(html,/말씀나눔 · 모두가 듣도록, 다음 세대까지/);
  assert.match(html,/2026년 10월 11일/);
  assert.match(html,/print-bulletin/);
  assert.match(css,/@media print/);
});
test('live composition has both 16:9 and 9:16 static safe capture views',()=>{
  assert.match(html,/\?view=stage/);
  assert.match(html,/\?view=vertical/);
  assert.match(html,/\?view=operator/);
  assert.match(css,/aspect-ratio:16\/9/);
  assert.match(css,/aspect-ratio:9\/16/);
  assert.match(js,/BroadcastChannel/);
  assert.match(js,/addEventListener\('storage'/);
  assert.match(js,/requestFullscreen/);
});
test('worship slide content contains exactly 16 authored slides and never receives stream keys',()=>{
  assert.equal((js.match(/\{title:/g)||[]).length,16);
  assert.match(js,/모두가 듣도록/);
  assert.match(js,/에클레시아/);
  assert.match(js,/코이노니아/);
  assert.match(js,/디아스포라/);
  assert.match(js,/희년/);
  assert.doesNotMatch(js,/RTMP_[A-Z_]*KEY|PRISM_STREAM_KEY|PRIVATE_KEY|SUPABASE_SERVICE_ROLE/);
  assert.ok(!html.includes('<script>') && !html.includes('onclick='),'church CSP requires external scripts');
});
test('October 11 published archive remains intact while the homepage points to the current week',()=>{
  const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.doesNotMatch(home,/data-weekly-bulletin href="\/ekodichurch\/worship\/2026-10-11\//);
  assert.match(html,/\/ekodichurch\/worship\/2026-10-11\//);
});
test('operator JavaScript parses without external dependencies',()=>{
  new Function(js);
  assert.match(js,/localStorage\.setItem/);
  assert.match(js,/window\.open/);
  assert.match(js,/textContent/);
});