import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('business-card-studio/cards.js',root),'utf8');
const html=readFileSync(new URL('business-card-studio/index.html',root),'utf8');
const build=readFileSync(new URL('scripts/build.mjs',root),'utf8');
const biz=readFileSync(new URL('ekodibiz/index.html',root),'utf8');
test('EKODI card studio ships at canonical original path and is linked from EKODIBIZ',()=>{
 assert.match(build,/business-card-studio.*ekodibiz\/cards/);
 assert.match(biz,/href="\/ekodibiz\/cards\/"/);
 assert.match(html,/<script defer src="\/o2o-qr-vendor\.js"/);
 assert.match(html,/id="approve"/);assert.match(html,/id="download" disabled/);
 assert.match(html,/id="request" disabled/);assert.match(html,/aria-disabled="true"/);
 assert.doesNotMatch(html,/<script>(?!<\/script>)/);
});
test('latest approved card content retained without image-generated invented numbers',()=>{
 for(const value of ['비비큐 무안청계점','피자마루 목포대점','청계면상인회','박은희','061 453 8295','신한 110 248 100718','정찬균','010 3501 8542','ekodi.kr/mission','cgma4989@gmail.com','신한 100 037 318876','청춘이 계속되는 거리'])assert.ok(source.includes(value),value);
 assert.match(source,/QR 목적지/);
 assert.match(source,/new QRCode/);
 assert.match(source,/qrData/);
});
test('worker asset path, print geometry and explicit handoff keep printing separate from payment',()=>{
 new vm.Script(source,{filename:'cards.js'});
 assert.match(source,/94\*72\/25\.4/);
 assert.match(source,/54\*72\/25\.4/);
 assert.match(source,/new Blob\(\[bytes\],\{type:'application\/pdf'\}\)/);
 assert.match(source,/mailto:ekodibiz@gmail\.com/);
 assert.match(html,/주문 접수·결제·제작은 외부 인쇄업체/);
 assert.doesNotMatch(source,/fetch\(/); // Never store PII or submit orders as a hidden request
});
test('PDF assembler builds a valid two-page xref structure',()=>{
 const first=source.indexOf('function pdfBytes(images){'),last=source.indexOf('\nasync function download(){',first);
 assert.ok(first>=0&&last>first);
 const sandbox={TextEncoder,Uint8Array,String};
 const assemble=new vm.Script(source.slice(first,last)+'\npdfBytes;',{filename:'pdf-assembler.js'}).runInNewContext(sandbox);
 const jpg=Uint8Array.from([0xff,0xd8,0xff,0xdb,0x00,0x04,0x00,0x00,0xff,0xd9]);
 const result=assemble([jpg,jpg]);const txt=new TextDecoder('latin1').decode(result);
 assert.match(txt,/^%PDF-1\.4/);
 assert.match(txt,/\/Count 2/);
 assert.match(txt,/\/MediaBox \[0 0 266\.45669 153\.07087\]/);
 assert.equal((txt.match(/\/Subtype \/Image/g)||[]).length,2);
 assert.equal((txt.match(/\/Type \/Page /g)||[]).length,2);
 const m=txt.match(/startxref\n(\d+)\n%%EOF/);assert.ok(m);
 assert.equal(txt.indexOf('xref\n0 9\n'),Number(m[1]));
});