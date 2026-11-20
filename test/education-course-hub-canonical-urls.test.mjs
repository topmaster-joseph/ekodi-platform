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

test('already-prefixed course catalog URLs are not prefixed twice in learner/teacher resource links',async()=>{
 const source=await read('education/course-hub/hub.js');
 const routeSource=source.match(/function route\(path\)\{[\s\S]*?\n\}/)?.[0];
 const functionSource=source.match(/function safeLink\(value\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(routeSource&&functionSource,'shared route and safeLink renderers must be present');
 const check=base=>{
  const context={SLASH:'/',base};
  return vm.runInNewContext(routeSource+'\n'+functionSource+'\n({safeLink,route})',context);
 };
 const {safeLink:canonical,route:routeCanonical}=check('/edu');
 const upstream='/study/live/?c=mnu-factchat-2026';
 const alreadyMounted='/edu/study/live/?c=mnu-factchat-2026';
 assert.equal(canonical(upstream),alreadyMounted);
 assert.equal(canonical(alreadyMounted),alreadyMounted);
 assert.equal(canonical('/edu/pizza-experience/'),'/edu/pizza-experience/');
 assert.equal(canonical('/edu/'),'/edu/');
 assert.equal(canonical('//other.example/evil'),'');
 assert.equal(canonical('https://evil.example/attack'),'');
 const sourceAsSeenByBrowser=prefixRootLiterals(JSON.stringify({studyUrl:upstream,teacherTool:upstream}),'/edu');
 assert.equal(canonical(JSON.parse(sourceAsSeenByBrowser).studyUrl),alreadyMounted);
 assert.equal(canonical(JSON.parse(sourceAsSeenByBrowser).teacherTool),alreadyMounted);
 assert.equal(check('').safeLink(upstream),upstream,'staging / unmounted origin remains relative to its root');
 assert.equal(canonical('/edu/edu/study/live/'),'', 'never output an invalid repeated prefix');
 assert.equal(routeCanonical('/edu/study/live/'),'/edu/study/live/', 'already mounted paths stay unchanged');
 assert.equal(routeCanonical('/edu/edu/study/live/'),'', 'route function rejects duplicate mount');
 assert.equal(routeCanonical('/learn/mnu-factchat-2026/'),'/edu/learn/mnu-factchat-2026/');
 assert.equal(routeCanonical('/teach/'),'/edu/teach/');

});
