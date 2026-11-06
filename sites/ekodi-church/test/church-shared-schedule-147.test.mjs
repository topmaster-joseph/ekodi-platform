import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');

test('Church keeps its own schedule board and renders separately owned Mission dates',async()=>{
 const [html,css,js]=await Promise.all([read('index.html'),read('church-homepage-layout.css'),read('church-shared-schedules.js')]);
 assert.match(html,/id="church-schedules" data-church-shared-schedules/);
 assert.match(html,/href="\/ekodichurch\/board\?category=schedule"/);
 assert.match(html,/src="church-shared-schedules\.js" defer/);
 assert.match(css,/\.church-shared-schedule ol\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:720px\)\{\.church-shared-schedule/);
 assert.match(js,/\/ekodichurch\/board\/api\/shared-schedules/);
 assert.match(js,/sourceLabel/);
 assert.match(js,/kind==='recurring-meeting'/);
 assert.match(js,/\.filter\(Boolean\)\.join\(' · '\)/);
 assert.match(js,/document\.createElement/);
 assert.match(js,/textContent=text/);
 assert.doesNotMatch(js,/innerHTML|POST|PATCH|DELETE/);
});

test('Only same-origin, Church or Mission public deep links can be assigned to shared schedule anchors',async()=>{
 const js=await read('church-shared-schedules.js');
 const match=js.match(/const escUrl=value=>[^\n]+/);
 assert.ok(match);
 const urlGuard=new Function('return ('+match[0].replace('const escUrl=','').replace(/;\s*$/,'')+');')();
 assert.equal(urlGuard('/ekodichurch/board/post/3'),'/ekodichurch/board/post/3');
 assert.equal(urlGuard('/ekodimission?meeting=2026-11-07#saturday'),'/ekodimission?meeting=2026-11-07#saturday');
 for(const bad of ['https://evil.example','//evil.example','javascript:alert(1)','/admin'])assert.equal(urlGuard(bad),'');
});
