import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const src=await readFile(new URL('../scripts/inspect-seonammedi-edge-jsd.mjs',import.meta.url),'utf8');
const start=src.indexOf('function loaderMetadata('),end=src.indexOf('function inspectHtml(',start);
assert.ok(start>=0&&end>start);
const sandbox={URL};
vm.runInNewContext(src.slice(start,end)+';globalThis.read=loaderMetadata;',sandbox);
const read=sandbox.read;

test('redacted edge metadata identifies only a local Cloudflare loader',()=>{
  const body="(function(){if(!document.body)return;var l=window.location,o;try{o=new URL(l.origin).origin}catch(e){try{o=new URL(new URL(l.href).origin).origin}catch(e){o=''}}var u='/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=12345',s=document.createElement('script');s.src=o?new URL(u,o).href:u;document.head.appendChild(s);})();";
  const result=read(body);
  assert.equal(result.kind,'precursor/main.js');
  assert.equal(result.createsScript,true);
  assert.equal(result.queryKeys[0],'ray');
  assert.equal(result.fallbackLiteralLength,0);
  assert.ok(!JSON.stringify(result).includes('12345'),'query values must not be emitted');
});
test('external and unknown loader paths are not promoted to trusted taxonomy',()=>{
  const body="var u='https://attacker.example/x.js',s=document.createElement('script')";
  assert.equal(read(body).kind,'unknown');
  assert.equal(read('eval(1)').template,'unknown');
  assert.ok(!src.includes('console.log(body)'));
});
