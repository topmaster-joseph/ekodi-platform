import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const site=readFileSync(new URL('../wrangler.site.toml',import.meta.url),'utf8');
const worker=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
const headers=readFileSync(new URL('../_headers',import.meta.url),'utf8');
const shell=readFileSync(new URL('../site-shell-worker.js',import.meta.url),'utf8');
const m=site.match(/^run_worker_first = \[([^\n]+)\]$/m);
if(!m) throw Error('run_worker_first source declaration is absent');
const routes=JSON.parse('['+m[1]+']');

test('only the slashless Office root enters Worker first, not static assets',()=>{
 assert.ok(routes.includes('/office'),'exact slashless path needs the Worker to skip asset 3xx canonicalization');
 assert.ok(!routes.includes('/office/*'),'keep static CSS/JS asset-first for quota');
 assert.ok(!routes.includes('/office*'),'do not expand runtime request budget unexpectedly');
});
test('Office direct Worker contract and static asset CSP are preserved',()=>{
 assert.match(worker,/url\.pathname === '\/office' \|\| url\.pathname\.startsWith\('\/office\/'\)/);
 assert.match(worker,/url\.pathname==='\/office'\?'\/office\/':url\.pathname/);
 assert.match(worker,/office-method-blocked/);
 assert.match(shell,/if\(pathname==='\/office'\|\|pathname\.startsWith\('\/office\/'\)\)return response/);
 assert.match(worker,/OFFICE_HUB_CSP/);
 for(const p of ['/office','/office/','/office/*']){
   const section=headers.split('\n'+p+'\n')[1]?.split('\n\n')[0];
   assert.ok(section,'missing _headers '+p);
   assert.match(section,/Cache-Control: no-store/);
   assert.match(section,/connect-src 'none'/);
 }
});
