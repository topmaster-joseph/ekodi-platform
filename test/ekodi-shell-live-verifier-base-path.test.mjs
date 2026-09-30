import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Shell live verifier resolves assets below the configured shell base path',async()=>{
  const verifier=await read('scripts/verify-ekodi-shell-live.mjs');
  assert.ok(verifier.includes("new URL(String(path).replace(/^\\/+/,''),`${base}/`)"));
  assert.ok(!verifier.includes("new URL(path,`${base}/`)"));
  for(const path of ['/health','/manifest.json','/shell.js','/user-language.js','/user-ui-shell.css']){
    assert.ok(verifier.includes(`read('${path}',attempt)`),`missing verifier probe for ${path}`);
  }
});
