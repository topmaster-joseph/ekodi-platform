import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../auth-site/admin-auth.js',import.meta.url),'utf8');
const expression=source.match(/const safeReturn=\(\(\)=>\{[^\n]+\}\)\(\);/)?.[0];
assert.ok(expression,'secure, exact-route admin return allowlist must exist');
function safe(target){
 const scope={URL,runtime:{environment:'production',authOrigin:'https://ekodi.kr'},params:new URLSearchParams({return_to:target}),defaultReturn:'https://ekodi.kr/admin/',rawReturn:target};
 return vm.runInNewContext(expression+'\nsafeReturn',scope);
}
test('Education teacher hub is allowed as one exact canonical admin return target',()=>{
 assert.equal(safe('https://ekodi.kr/edu/teach/'),'https://ekodi.kr/edu/teach/');
 assert.equal(safe('https://ekodi.kr/edu/study/live/'),'https://ekodi.kr/edu/study/live/');
});
test('Education login allowlist does not grant prefix, foreign origin or query bypasses',()=>{
 for(const route of [
  'https://evil.example/edu/teach/',
  'https://ekodi.kr/edu/teach/evil/',
  'https://ekodi.kr/edu/teacher/',
  'https://ekodi.kr/edu/teach/?redirect=https://evil.example/',
  'https://ekodi.kr/edu/teach/#ekodi_admin_token=not-real',
  'http://ekodi.kr/edu/teach/'
 ])assert.equal(safe(route),'https://ekodi.kr/admin/',route);
});
test('verified instructor hub uses the EKODI central admin auth endpoint',()=>{
 const page=readFileSync(new URL('../education/course-hub/auth.js',import.meta.url),'utf8');
 assert.match(page,/centralLogin\('admin'\)/);
 assert.match(page,/return_to/);
 assert.match(page,/site','admin'/);
 const router=readFileSync(new URL('../education/course-hub/router.js',import.meta.url),'utf8');
 assert.match(router,/role.*super_admin/);
 assert.match(router,/ADMIN_SESSION_URL/);
});
