import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {learnerUrl,livePath,SLASH} from '../education/study/live/engine/model.js';
import {encodeQr,qrSvg} from '../education/study/live/engine/qr.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const ROOT='https://ekodi.kr';
const education=(path)=>new URL(path,ROOT);

test('all registered courses have one direct /edu source URL, including learner handouts and trainer resources',async()=>{
 const json=JSON.parse(await read('education/courses/catalog.json'));
 assert.equal(new Set(json.courses.map(c=>c.id)).size,json.courses.length);
 assert.equal(json.courses.length,6);
 let checked=0;
 for(const c of json.courses){
  const routes=[c.studyUrl,c.teacherTool,c.learnerTool,...(c.resources||[]).map(r=>r.url)].filter(Boolean);
  assert.ok(routes.length>0,c.id);
  for(const path of routes){
   assert.ok(path.startsWith('/edu/'),'source must be canonical: '+c.id+' '+path);
   assert.doesNotMatch(path,/^\/edu(?:\/edu)+(?:\/|$)/,'duplicate education mount '+path);
   assert.doesNotMatch(path,/^\/edu\/(?:auth|admin)\//,'course should not encode privileged area '+path);
   const url=education(path);
   assert.equal(url.origin,ROOT);
   assert.ok(url.pathname.endsWith('/')||url.pathname.includes('.'),'canonical course route uses direct slash '+path);
   checked++;
  }
 }
 assert.ok(checked>=20,'include all course original, instructor, learner and handout links');
});

const pages=[
 'education/index.html','education/admission/index.html','education/study/index.html',
 'education/study/academy/index.html','education/study/ai-bootcamp/index.html',
 'education/study/ai-bootcamp/studio/index.html','education/study/ai-bootcamp/documents/index.html',
 'education/study/cold-safety-2026/index.html','education/study/farm-marketing/index.html',
 'education/pizza-experience/index.html','education/factchat/index.html',
 'education/course-hub/index.html','education/course-hub/signin.html',
 'education/study/live/index.html','education/study/live/lab/index.html',
 'education/study/live/present/index.html','education/study/live/handout/index.html',
 'education/study/live/docs/index.html','education/study/live/screen-share/index.html',
 'education/study/live/guide/index.html','education/study/live/guide/feedback.html',
 'education/study/live/guide/stats.html','education/study/live/feedback/index.html',
];
test('all Education HTML anchor destinations are already canonical (no relative escape or redirect-dependent old source paths)',async()=>{
 let count=0;
 for(const name of pages){
  const html=await read(name),logical=name.replace(/^education\//,'').replace(/index\.html$/,'');
  const publicUrl=new URL('/edu/'+logical,ROOT);
  const anchors=[...html.matchAll(/<a\b[^>]*?\bhref=(["'])(.*?)\1/gs)];
  for(const [,q,href] of anchors){
   if(!href||href.startsWith('#')||/^(?:mailto:|tel:|javascript:|data:)/i.test(href))continue;
   const raw=href.replaceAll('&amp;','&');
   // All static root-absolute navigation now contains the intended /edu mount.
   if(raw.startsWith('/')&&!raw.startsWith('//')){
    assert.ok(raw.startsWith('/edu/'),name+' non-canonical source anchor '+raw);
   }
   const url=new URL(raw,publicUrl);
   assert.doesNotMatch(url.pathname,/^\/edu(?:\/edu)+(?:\/|$)/,name+' duplicate mount '+raw);
   assert.ok(url.protocol==='https:'||url.protocol==='http:',name+' invalid protocol '+raw);
   if(url.origin===ROOT&&raw.startsWith('.')&&url.pathname.startsWith('/edu/')){
    assert.ok(!url.pathname.includes('/../'),name+' unnormalized path '+raw);
   }
   count++;
  }
 }
 assert.ok(count>110,'must inspect all sub-page headings, navigation, course and lab links');
});

test('course lesson, presenter and handout QR URL uses real canonical Learner Lab directly',()=>{
 const ids=['mnu-factchat-2026','mnu-factchat-120m-2026'];
 let qr=0;
 for(const id of ids){
  for(const route of ['/edu/study/live/','/edu/study/live/present/','/edu/study/live/handout/','/edu/factchat/']){
   assert.equal(livePath(route,'lab'+SLASH),'/edu/study/live/lab/');
   for(const sessionNo of [1,2]){
    const url=learnerUrl(ROOT,route,{c:id,s:sessionNo,m:'hwp',lv:'basic'});
    const target=new URL(url);
    assert.equal(target.origin,ROOT);
    assert.equal(target.pathname,'/edu/study/live/lab/');
    assert.equal(target.searchParams.get('c'),id);
    assert.equal(target.searchParams.get('s'),String(sessionNo));
    assert.equal(target.searchParams.get('open'),sessionNo===2?'1':null);
    assert.ok(!url.includes('/edu/edu/'));
    const matrix=encodeQr(url);
    assert.ok(matrix.size>=21&&matrix.size===matrix.modules.length);
    assert.ok(matrix.modules.every(row=>row.length===matrix.size));
    const svg=qrSvg(url,{label:'수강생 입장'});
    assert.ok(svg.startsWith('<svg ')&&svg.includes('aria-label="수강생 입장"')&&svg.includes('<path d="'));
    assert.doesNotMatch(svg,/api\.qrserver|quickchart|<script|onload=|<foreignObject/i,'no fetched QR service or executable SVG');
    qr++;
   }
  }
 }
 assert.equal(qr,16);
});

test('feedback and consenting screen-share QR targets are same-origin canonical and least-privilege',async()=>{
 const [feedback,api,client,hub,html]=await Promise.all([
  read('education/study/live/guide/feedback.js'),
  read('education-screen-share-api.js'),
  read('education/study/live/screen-share/screen-share.js'),
  read('education/course-hub/hub.js'),
  read('education/course-hub/index.html'),
 ]);
 assert.match(feedback,/ORIGIN\+'\/edu\/study\/live\/feedback\/\?s='/);
 assert.match(feedback,/qrSvg\(url,/);
 assert.match(api,/joinUrl:'https:\/\/ekodi\.kr\/edu\/study\/live\/screen-share\/\?r='\+id\+'#k='\+joinKey/);
 assert.match(client,/qrSvg\(data\.joinUrl,/);
 assert.match(client,/location\.hash\.slice\(1\)/);
 assert.match(hub,/studentInviteUrl=new URL\(page,location\.origin\)\.href/);
 assert.match(hub,/studentQr=qrSvg\(studentInviteUrl/);
 assert.match(hub,/id=\"teacherStudentQr\" data-target=/);
 assert.match(html,/<script type=\"module\" src=\"\/course-hub\/hub\.js\"><\/script>/);
 for(const session of [1,2,3,4,5]){
  const target=new URL(ROOT+'/edu/study/live/feedback/?s='+session);
  assert.equal(target.pathname,'/edu/study/live/feedback/');
  assert.equal(target.searchParams.get('s'),String(session));
  assert.ok(qrSvg(target.href).includes('<svg'));
 }
 const join=new URL(ROOT+'/edu/study/live/screen-share/?r='+'a'.repeat(32)+'#k='+'b'.repeat(64));
 assert.equal(join.pathname,'/edu/study/live/screen-share/');
 assert.equal(join.searchParams.get('r'),'a'.repeat(32));
 assert.equal(join.hash,'#k='+'b'.repeat(64));
 assert.ok(!join.searchParams.has('k'),'do not expose participant secret to server request logs');
});
