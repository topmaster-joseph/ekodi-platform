import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Shell live verifier resolves assets below the configured shell base path',async()=>{
  const verifier=await read('scripts/verify-ekodi-shell-live.mjs');
  assert.match(verifier,/new URL\(String\(path\)\.replace\(\/\^\\\/+\/,'{2}\),`\$\{base\}\/'\)/);
  assert.doesNotMatch(verifier,/new URL\(path,`\$\{base\}\/'\)/);
  for(const path of ['/health','/manifest.json','/shell.js','/user-language.js','/user-ui-shell.css']){
    assert.match(verifier,new RegExp(`read\\('${path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}'`));
  }
});
