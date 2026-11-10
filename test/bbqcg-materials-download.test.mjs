import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bbqcgPublicResourceDownload, bbqcgHomeWithResources, renderBbqcgServiceStandards, bbqcgServiceStandardsCss } from '../bbqcg-service-standards.js';
import { renderBbqCheonggyePage } from '../bbq-cheonggye-site.js';

const root='https://ekodi.kr/bbqcg';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('service guide introduces downloads without franchisor-only materials',async()=>{
 const r=renderBbqcgServiceStandards(new Request(root+'/service-guide'));
 const html=await r.text();
 assert.equal(r.status,200);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);
 for(const token of ['id="materials"','매장 소개 · 자료 다운로드','/bbqcg/resources/store-promise.html','/bbqcg/resources/qcs-gms-checklist.csv'])assert.ok(html.includes(token),token);
 assert.doesNotMatch(html,/슬라이드 원본 다운로드|조리 비법 다운로드|수수료 1\.7%|2% 적립 혜택|Powered by EKODI/);
 const css=await bbqcgServiceStandardsCss().text();
 assert.match(css,/\.downloads-grid/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media print/);
});
test('downloadable store promise is self-contained printable HTML and not private data',async()=>{
 const res=bbqcgPublicResourceDownload(new Request(root+'/resources/store-promise.html'),'/bbqcg/resources/store-promise.html');
 const body=await res.text();
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-disposition'),/attachment; filename="bbqcg-store-promise\.html"/);
 assert.match(res.headers.get('content-type'),/text\/html/);
 assert.match(res.headers.get('x-robots-tag'),/noindex/);
 assert.match(res.headers.get('cache-control'),/no-store/);
 for(const word of ['BBQ 무안청계점','좋은 한 끼를 위한 세 가지 약속','QUALITY','CLEANLINESS','SERVICE','@page'])assert.ok(body.includes(word),word);
 assert.doesNotMatch(body,/EKODI|고객 전화번호|고객 이메일|임직원 기록|교육자료 원문/);
});
test('blank checklist is Excel-friendly CSV, no captured private data or franchise numbers',async()=>{
 const res=bbqcgPublicResourceDownload(new Request(root+'/resources/qcs-gms-checklist.csv'),'/bbqcg/resources/qcs-gms-checklist.csv');
 const body=await res.text();
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-disposition'),/attachment/);
 assert.match(res.headers.get('content-type'),/text\/csv/);
 assert.ok(body.startsWith('\uFEFF'));
 for(const v of ['점검 항목','QCS·품질','QCS·청결','QCS·서비스','GMS·채널','GMS·개선'])assert.ok(body.includes(v),v);
 assert.doesNotMatch(body,/1\.7%|2% 적립|쿠폰 발행|고객전화|대표자 주민번호|EKODI/);
});
test('unknown downloads fail closed, uploads disabled, HEAD no body',async()=>{
 for(const pathname of ['/bbqcg/resources/notes.csv','/bbqcg/resources/../../secrets.txt','/bbqcg/resources/qcs-gms-checklist.pdf']){
  assert.equal(bbqcgPublicResourceDownload(new Request(root),pathname).status,404);
 }
 const head=bbqcgPublicResourceDownload(new Request(root,{method:'HEAD'}),'/bbqcg/resources/qcs-gms-checklist.csv');
 assert.equal(head.status,200);
 assert.equal(await head.text(),'');
 const post=bbqcgPublicResourceDownload(new Request(root,{method:'POST'}),'/bbqcg/resources/store-promise.html');
 assert.equal(post.status,405);
 assert.match(post.headers.get('allow'),/GET/);
});
test('public storefront keeps original franchise identity, routes and adds materials entry',async()=>{
 const r=await bbqcgHomeWithResources(await renderBbqCheonggyePage(new Request(root),{}, {name:'BBQ 무안청계점'}));
 const body=await r.text();
 assert.match(body,/<nav class="nav"/);
 assert.match(body,/href="\/bbqcg\/service-guide">품질약속·자료실/);
 assert.match(body,/id="bbqcg-promise-heading"/);
 assert.match(body,/소개·자료 다운로드/);
 assert.match(body,/href="\/bbqcg\/admin"/);
 assert.match(body,/https:\/\/bbq\.co\.kr\//);
 assert.doesNotMatch(body,/Powered by EKODI/);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);
 const h=await bbqcgHomeWithResources(await renderBbqCheonggyePage(new Request(root,{method:'HEAD'}),{},{}));
 assert.equal(await h.text(),'');
});
test('Space Worker serves only fixed filenames under verified customer tenant',async()=>{
 const source=await read('space-worker.js');
 assert.match(source,/bbqcgPublicResourceDownload/);
 assert.match(source,/bbqcgHomeWithResources/);
 assert.ok(source.includes("store-promise") && source.includes("qcs-gms-checklist"));
 assert.match(source,/resolved\.source!=='store-user-sites'/);
 assert.match(source,/resolved\.status==='paused'/);
 assert.match(source,/bbqcheonggye/);
 assert.match(source,/status:410/);
});
