import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import platform, { isWorkspaceAdminAssetPath } from '../platform-router-entry-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('workspace admin asset paths are recognised narrowly', () => {
  for (const p of ['/cgma/admin/assets/cgma-member-admin.js','/cgma/admin/assets/cgma-member-admin.css','/cgma/admin/assets/cgma-motor-festival-admin.js'])
    assert.equal(isWorkspaceAdminAssetPath(p), true, p);
  for (const p of ['/cgma/admin/festival','/cgma/admin/member','/cgma/admin/assets/','/cgma/admin/assets/x.html','/cgma/admin/assets/a/b.js','/admin/assets/x.js','/cgma/admin/assets/../x.js'])
    assert.equal(isWorkspaceAdminAssetPath(p), false, p);
});

test('asset dispatch precedes the workspace admin shell in the router', async () => {
  const source = await read('platform-router-entry-worker.js');
  const asset = source.indexOf('if(isWorkspaceAdminAssetPath(url.pathname))return legacyPlatformRouter.fetch(request,env,ctx);');
  const shell = source.indexOf("if(isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname))return injectEkodiShell(workspaceAdminPage(),'space','admin');");
  assert.ok(asset > 0 && shell > 0 && asset < shell, 'asset passthrough must run before the admin shell catch-all');
});

test('CGMA admin modules are served as JS/CSS with the gateway-required route, not admin HTML', async () => {
  const files = {
    '/cgma-member-admin.js': ['export async function mountCgmaMemberAdmin(){}','text/javascript'],
    '/cgma-member-admin.css': ['.cgma-member-head{}','text/css'],
    '/cgma-motor-festival-admin.js': ['export async function mountCgmaMotorFestivalAdmin(){}','text/javascript'],
    '/cgma-motor-festival-admin.css': ['.cgma-festival h2{}','text/css'],
  };
  const env = { ENVIRONMENT:'test', ASSETS:{ async fetch(request){
    const hit = files[new URL(request.url).pathname];
    return hit ? new Response(hit[0],{headers:{'content-type':hit[1]}}) : new Response('not found',{status:404});
  } } };
  const ctx = { waitUntil(){}, passThroughOnException(){} };
  for (const [path, marker, type] of [
    ['/cgma/admin/assets/cgma-member-admin.js','mountCgmaMemberAdmin','javascript'],
    ['/cgma/admin/assets/cgma-member-admin.css','.cgma-member-head','css'],
    ['/cgma/admin/assets/cgma-motor-festival-admin.js','mountCgmaMotorFestivalAdmin','javascript'],
    ['/cgma/admin/assets/cgma-motor-festival-admin.css','.cgma-festival','css'],
  ]) {
    const response = await platform.fetch(new Request('https://ekodi.kr'+path,{headers:{'user-agent':'test','cf-connecting-ip':'203.0.113.9'}}), env, ctx);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-ekodi-route'), 'admin-workspace-asset', path);
    assert.match(response.headers.get('content-type') || '', new RegExp(type), path);
    const body = await response.text();
    assert.ok(body.includes(marker), path);
    assert.doesNotMatch(body, /<html|<!doctype/i, path);
  }
});
