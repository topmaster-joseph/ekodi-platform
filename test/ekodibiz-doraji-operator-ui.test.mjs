import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dorajiOperatorResponse,isDorajiOperatorPath} from '../ekodibiz-doraji-operator-ui.js';
import {dorajiOperatorScript} from '../ekodibiz-doraji-operator.js';
import {dorajiOfficeResponse} from '../ekodibiz-doraji-office.js';

const origin='https://ekodi.kr';
const get=path=>new Request(origin+path);
test('operator routes are narrow and GET-only, never exposing private records in static HTML',async()=>{
 for(const path of ['/ekodibiz/doraji/office','/ekodibiz/doraji/office/','/ekodibiz/doraji/office.js'])assert.equal(isDorajiOperatorPath(path),true);
 assert.equal(isDorajiOperatorPath('/ekodibiz/doraji/office/private-records'),false);
 const page=dorajiOperatorResponse(get('/ekodibiz/doraji/office'));
 assert.equal(page.status,200);
 assert.match(page.headers.get('cache-control'),/no-store/);
 assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
 const body=await page.text();
 assert.match(body,/중앙 관리자 로그인/);
 assert.match(body,/업무원장/);
 assert.match(body,/초안 저장/);
 assert.match(body,/\/ekodibiz\/doraji\/office\.js/);
 assert.doesNotMatch(body,/ekodi-auth-token|access_token|Bearer /);
 assert.equal(dorajiOperatorResponse(new Request(origin+'/ekodibiz/doraji/office',{method:'POST'})).status,405);
});
test('operator JS is served from same-origin Worker, never as inline authorization code',async()=>{
 const res=dorajiOperatorResponse(get('/ekodibiz/doraji/office.js'));
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type'),/javascript/);
 const code=await res.text();
 assert.ok(code.startsWith('(()=>{'));
 assert.match(code,/sessionStorage\.getItem\(TOKEN_KEY\)/);
 assert.match(code,/authorization:'Bearer '/);
 assert.match(code,/credentials:'omit'/);
 assert.match(code,/redirect:'manual'/);
 assert.match(code,/data\.error/);
 assert.doesNotMatch(code,/localStorage|dangerouslySetInnerHTML|\.innerHTML\s*=|fetch\(['"]https:\/\//);
 assert.equal(code,dorajiOperatorScript);
});
test('business nav and canonical site shell mount operator before Doraji public catchall',async()=>{
 const page=await dorajiOfficeResponse(get('/ekodibiz/doraji/overview')).text();
 assert.match(page,/\/ekodibiz\/doraji\/office/);
 const site=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');
 assert.match(site,/import \{ dorajiOperatorResponse, isDorajiOperatorPath \}/);
 assert.ok(site.indexOf('if (isDorajiOperatorPath(url.pathname))')<site.indexOf('if (isDorajiOfficePath(url.pathname))'));
 assert.ok(site.indexOf('if (isDorajiLedgerApiPath(url.pathname))')<site.indexOf('if (isDorajiOperatorPath(url.pathname))'));
 assert.match(site,/private-ekodibiz-doraji-operator/);
});
