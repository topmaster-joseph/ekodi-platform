import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

// Model the already-deployed canonical-Site-Core literal transformer without touching shared routing.
const prefixRootLiterals=(text,prefix)=>String(text).replace(/(["'])\/(?!\/)([^"'\r\n]*)\1/g,(match,q,rest)=>{
 const path='/'+rest;return path===prefix||path.startsWith(prefix+'/')?match:q+prefix+path+q;
});
test('the canonical /edu text proxy must not mutate course hub JavaScript navigation',async()=>{
 const [hub,auth]=await Promise.all([read('education/course-hub/hub.js'),read('education/course-hub/auth.js')]);
 assert.equal(prefixRootLiterals(hub,'/edu'),hub,'catalog, filter, learner, teacher URLs must be base-path aware');
 assert.equal(prefixRootLiterals(auth,'/edu'),auth,'central EKODI auth handoff and Supabase identity URL must not change');
 assert.equal(prefixRootLiterals("route('/courses/catalog.json')",'/edu'),"route('/edu/courses/catalog.json')",'guard demonstrates previous broken transformation');
 assert.match(hub,/split\(SLASH\)/);
 assert.match(hub,/route\(SLASH\+'courses\/catalog\.json'\)/);
 assert.match(auth,/sb\+SLASH\+'auth\/v1\/verify'/);
 assert.match(auth,/base\+SLASH\+'teach\/access'/);
});
test('course hub slash builder generates one /edu prefix and correct section route',async()=>{
 const hub=await read('education/course-hub/hub.js');
 const definitions=hub.match(/const SLASH=String\.fromCharCode\(47\);\s*const base=[^\n]+\s*const path=[^\n]+/);
 assert.ok(definitions,'course-hub canonical prefix + path parser');
 const result=vm.runInNewContext(definitions[0]+"\n({base,path,catalog:base+SLASH+'courses/catalog.json',student:base+SLASH+'learn/example/'})",{location:{pathname:'/edu/courses/'}});
 assert.equal(result.base,'/edu');assert.deepEqual(Array.from(result.path),['courses']);
 assert.equal(result.catalog,'/edu/courses/catalog.json');assert.equal(result.student,'/edu/learn/example/');
});
test('Central login remains separately scoped to exact auth /edu instructor entry',async()=>{
 const auth=await read('education/course-hub/auth.js');
 assert.match(auth,/location\.replace\(base\+SLASH\+'teach'\+SLASH\)/);
 assert.doesNotMatch(auth,/base\+'\/edu\/teach\/'/);
});
