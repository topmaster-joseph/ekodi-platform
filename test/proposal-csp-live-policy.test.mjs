import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
const worker=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const expected="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'; object-src 'none'";

function section(route){
 const marker='\n'+route+'\n';
 const index=headers.indexOf(marker);
 assert.ok(index>=0,route+' missing');
 return headers.slice(index+marker.length).split(/\n\s*\n/)[0];
}

test('Proposal Studio static CSP restores same-origin modules only on its two canonical paths',()=>{
 for(const route of ['/proposal/','/proposal/*']){
  const body=section(route);
  assert.match(body,/^  ! Content-Security-Policy$/m);
  assert.ok(body.includes('  Content-Security-Policy: '+expected));
  assert.match(body,/^  ! Cache-Control$/m);
  assert.match(body,/^  Cache-Control: no-store$/m);
  assert.match(body,/^  X-Robots-Tag: noindex, nofollow, noarchive$/m);
  assert.doesNotMatch(body,/https?:\/\//);
 }
});
test('Global static hard-deny CSP remains intact for every other route',()=>{
 assert.match(headers,/^\/\*\n(?:[^\n]*\n)*?  Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'/m);
 assert.ok(headers.includes('/business-coop\n'));
 assert.ok(headers.includes('/seonammedi\n'));
});
test('Same-origin proposal editor stays read-only, allowlisted, never indexed or persisted',()=>{
 assert.ok(worker.includes("if (url.pathname === '/proposal' || url.pathname.startsWith('/proposal/'))"));
 assert.ok(worker.includes("!['GET','HEAD'].includes(request.method)"));
 assert.ok(worker.includes("proposal-browser-draft"));
 assert.ok(worker.includes("'X-Robots-Tag','noindex, nofollow, noarchive'"));
 assert.ok(worker.includes("'/proposal/client.js'"));
 assert.ok(worker.includes("'/proposal/docx.js'"));
 assert.ok(build.includes('${root}proposal'));
});
