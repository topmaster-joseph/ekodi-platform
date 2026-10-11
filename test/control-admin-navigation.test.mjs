import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const routeSource=readFileSync(new URL('../admin-canonical-routes.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../control.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../control.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../control-admin-nav.js',import.meta.url),'utf8');
test('eight grouped administrator menus with unique real destination links',()=>{
 const groups=[...html.matchAll(/class="admin-nav-group"/g)];
 const items=[...html.matchAll(/class="admin-nav-link" href="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(groups.length,8);
 assert.equal(items.length,28);
 assert.deepEqual([...new Set(items)].length,26);
 for(const u of items){const url=new URL(u,'https://ekodi.kr');if(url.pathname==='/admin/control')continue;assert.ok(routeSource.includes("'"+url.pathname.split('/').at(-1)+"':")||routeSource.includes(url.pathname.split('/').at(-1)+":"),'unknown admin route: '+u)}
 for(const title of ['플랫폼 운영','사이트·브랜드','회원·권한','AI·자동화','콘텐츠·행사·소통','운영·배포·장애','데이터·통계','설정·보안·감사'])assert.ok(html.includes(title),title);
});
test('Control keeps original independently verified command actions and white layout',()=>{
 assert.ok(html.includes('id="commandForm"'));
 assert.ok(html.includes('id="taskCards"'));
 assert.ok(html.includes('id="workerCards"'));
 assert.ok(html.includes('id="resultCards"'));
 assert.ok(html.includes('src="/control-admin-nav.js"'));
 assert.match(css,/\.control-main\{background:#fff/);
 assert.match(css,/\.admin-nav-children\[hidden\]/);
 assert.match(readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8'),/control-admin-nav\.js/);
 assert.match(readFileSync(new URL('../site-worker.js',import.meta.url),'utf8'),/control-admin-nav\.js/);
 assert.doesNotThrow(()=>new Function(nav));
});
