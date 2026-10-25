import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {routeSinglesSurface} from '../singles-surface.js';
const app=await readFile(new URL('../sites/ekodi-singles/public/app.js',import.meta.url),'utf8');
const surface=await readFile(new URL('../singles-surface.js',import.meta.url),'utf8');

test('identity client is self-hosted, version-pinned and its SRI matches the shipped file',async()=>{
  const m=app.match(/const SUPABASE_JS=Object\.freeze\(\{src:'\/singles\/vendor\/(supabase-js-\d+\.\d+\.\d+\.umd\.js)',integrity:'(sha384-[A-Za-z0-9+/=]+)'\}\);/);
  assert.ok(m,'pinned descriptor missing');
  const file=await readFile(new URL('../sites/ekodi-singles/public/vendor/'+m[1],import.meta.url));
  assert.equal('sha384-'+createHash('sha384').update(file).digest('base64'),m[2],'integrity must match file bytes');
  assert.match(app,/script\.src=SUPABASE_JS\.src;script\.integrity=SUPABASE_JS\.integrity;script\.crossOrigin='anonymous';/);
  assert.doesNotMatch(app,/cdn\.jsdelivr\.net|supabase-js@2['"]/);
});
test('CSP allows only first-party scripts and the vendor file is served',async()=>{
  assert.doesNotMatch(surface,/jsdelivr/);
  const env={SINGLES_PUBLIC_PREVIEW_ENABLED:'true',ASSETS:{fetch:async r=>new Response('asset:'+new URL(r.url).pathname)}};
  const page=await routeSinglesSurface(new Request('https://ekodi.kr/singles'),env);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self';/);
  const asset=await routeSinglesSurface(new Request('https://ekodi.kr/singles/vendor/supabase-js-2.117.3.umd.js'),env);
  assert.equal(await asset.text(),'asset:/singles/vendor/supabase-js-2.117.3.umd.js');
  assert.equal((await routeSinglesSurface(new Request('https://ekodi.kr/singles/vendor/supabase-js-2.117.3.umd.js',{method:'POST'}),env)).status,405);
});
