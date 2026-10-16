import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../admin-central-handoff.js',import.meta.url),'utf8');
const authSource=readFileSync(new URL('../auth-site/admin-auth.js',import.meta.url),'utf8');
const fn=source.match(/function centralAdminAuthUrl\(v\)\{[^\n]+\}/)?.[0];
assert.ok(fn,'central admin URL constructor must be available');

function authUrl(href,section='common-services'){
  const context={
    URL,
    AUTH_URL:'https://ekodi.kr/auth/?site=admin&direct=1&return_to=https%3A%2F%2Fekodi.kr%2Fadmin%2F',
    location:{href},
    normalizeRoute:value=>value,
    routes:()=>({pathFor:name=>'/admin/services/'+name})
  };
  return new URL(vm.runInNewContext(fn+'\ncentralAdminAuthUrl('+JSON.stringify(section)+')',context));
}

test('AI admin login preserves safe service query and the original canonical child page',()=>{
  const url=authUrl('https://ekodi.kr/admin/services/common-services?service=ai');
  assert.equal(url.origin,'https://ekodi.kr');
  assert.equal(url.pathname,'/auth/');
  assert.equal(url.searchParams.get('site'),'admin');
  assert.equal(url.searchParams.get('direct'),'1');
  assert.equal(url.searchParams.get('return_to'),'https://ekodi.kr/admin/services/common-services?service=ai');
});

test('admin login never forwards authorization tokens or untrusted query values',()=>{
  const url=authUrl('https://ekodi.kr/admin/services/common-services?service=ai&ekodi_admin_token=SECRET&access_token=SECRET&redirect=https://evil.example/');
  const target=new URL(url.searchParams.get('return_to'));
  assert.equal(target.search,'?service=ai');
  assert.equal(target.hash,'');
  const other=authUrl('https://ekodi.kr/admin/services/common-services?service=ai%26access_token%3DSECRET');
  assert.equal(new URL(other.searchParams.get('return_to')).search,'');
});

test('Google authentication validates the canonical issued session before redirecting',()=>{
  assert.match(authSource,/const verified=await request\('\/api\/session'/);
  assert.match(authSource,/verified\.authenticated!==true/);
  assert.match(authSource,/admin_session_not_ready/);
  assert.match(authSource,/error\?\.status===401/);
  assert.match(authSource,/navigateToAdmin\(result\)/);
});
