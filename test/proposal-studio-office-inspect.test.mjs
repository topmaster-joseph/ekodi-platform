import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {zipXmlEntries} from '../proposal/zip.js';
import {inspectOfficeDocument} from '../proposal/import.js';
const file=(name,bytes)=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
const b=(parts)=>zipXmlEntries(parts.map(([name,content])=>({name,content})));
test('HWPX section XML is previewed only as an explicitly unverified local source',async()=>{
 const bytes=b([
  ['mimetype','application/hwp+zip'],
  ['Contents/section0.xml','<hs:sec xmlns:hp="urn:hp"><hp:p><hp:run><hp:t>전남 교육 &amp; 연구</hp:t></hp:run></hp:p><hp:p><hp:t>사업계획 2026</hp:t></hp:p></hs:sec>']
 ]);
 const p=await inspectOfficeDocument(file('template.hwpx',bytes));
 assert.equal(p.format,'hwpx');assert.match(p.excerpt,/전남 교육 & 연구/);assert.match(p.excerpt,/사업계획 2026/);
 assert.match(p.note,/원본을 수정하거나 재출력하지 않습니다/);
});
test('DOCX source text is previewed without treating it as verified evidence',async()=>{
 const bytes=b([
  ['[Content_Types].xml','<Types/>'],
  ['word/document.xml','<w:document><w:body><w:p><w:r><w:t>지역 소상공인</w:t></w:r></w:p></w:body></w:document>']
 ]);
 const p=await inspectOfficeDocument(file('draft.docx',bytes));
 assert.match(p.excerpt,/지역 소상공인/);
});
test('PPTX slide text and XLSX shared strings can be inspected locally',async()=>{
 const slides=b([
  ['ppt/presentation.xml','<p:presentation/>'],
  ['ppt/slides/slide1.xml','<p:sld><a:p><a:r><a:t>제안 요약</a:t></a:r></a:p></p:sld>']
 ]);
 assert.match((await inspectOfficeDocument(file('slides.pptx',slides))).excerpt,/제안 요약/);
 const sheet=b([
  ['xl/workbook.xml','<workbook/>'],
  ['xl/sharedStrings.xml','<sst><si><t>지원사업 예산</t></si></sst>'],
  ['xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c><v>25</v></c></row></sheetData></worksheet>']
 ]);
 assert.match((await inspectOfficeDocument(file('numbers.xlsx',sheet))).excerpt,/지원사업 예산/);
});
test('signature, declared file structure and formats are checked without executing embedded content',async()=>{
 const bad=b([['[Content_Types].xml','<Types/>'],['word/different.xml','<wrong/>']]);
 await assert.rejects(inspectOfficeDocument(file('fake.docx',bad)),/Word 본문/);
 await assert.rejects(inspectOfficeDocument(file('unsupported.pdf',bad)),/지원하지 않는 Office/);
 const noZip=new TextEncoder().encode('%PDF-'+('a'.repeat(20)));
 await assert.rejects(inspectOfficeDocument(file('spoofed.hwpx',noZip)),/ZIP/);
 const corrupted=b([['mimetype','application/hwp+zip'],['Contents/section0.xml','<hp:p><hp:t>x</hp:t></hp:p>']]);
 const bytes=corrupted.slice();bytes[bytes.length-1]^=1;
 await assert.rejects(inspectOfficeDocument(file('broken.hwpx',bytes)),/ZIP/);
});
test('DTD/ENTITY XML is never previewed',async()=>{
 const bytes=b([['mimetype','application/hwp+zip'],['Contents/section0.xml','<!DOCTYPE x [<!ENTITY secret "foo">]><hp:p><hp:t>&secret;</hp:t></hp:p>']]);
 await assert.rejects(inspectOfficeDocument(file('unsafe.hwpx',bytes)),/엔터티/);
});
test('compressed archives use a bounded standard deflate-raw reader when supported',async(t)=>{
 if(typeof DecompressionStream!=='function'){t.skip('native deflate stream unavailable');return;}
 // Replace an otherwise identical STORE payload with a small valid compressed
 // archive, preserving the ZIP size fields and central-directory offsets.
 const name='word/document.xml',payload='<w:p><w:t>압축 문서 검증</w:t></w:p>';
 const data=new TextEncoder().encode(payload),compressed=deflateRawSync(data);
 const nameBytes=new TextEncoder().encode(name);const zero=new Uint8Array(2);
 // A manual ZIP entry is used only to exercise method 8 in the reader.
 const part1=new Uint8Array(30+nameBytes.length+compressed.length);
 const v1=new DataView(part1.buffer);v1.setUint32(0,0x04034b50,true);v1.setUint16(4,20,true);v1.setUint16(6,0x800,true);v1.setUint16(8,8,true);
 v1.setUint32(18,compressed.length,true);v1.setUint32(22,data.length,true);v1.setUint16(26,nameBytes.length,true);
 part1.set(nameBytes,30);part1.set(compressed,30+nameBytes.length);
 const part2=new Uint8Array(46+nameBytes.length);const v2=new DataView(part2.buffer);
 v2.setUint32(0,0x02014b50,true);v2.setUint16(4,20,true);v2.setUint16(6,20,true);v2.setUint16(8,0x800,true);v2.setUint16(10,8,true);v2.setUint32(20,compressed.length,true);v2.setUint32(24,data.length,true);v2.setUint16(28,nameBytes.length,true);part2.set(nameBytes,46);
 const end=new Uint8Array(22),ve=new DataView(end.buffer);
 ve.setUint32(0,0x06054b50,true);ve.setUint16(8,1,true);ve.setUint16(10,1,true);ve.setUint32(12,part2.length,true);ve.setUint32(16,part1.length,true);
 const packed=new Uint8Array(part1.length+part2.length+end.length);packed.set(part1);packed.set(part2,part1.length);packed.set(end,part1.length+part2.length);
 const extra=b([['[Content_Types].xml','<Types/>'],['word/document.xml',payload]]);
 // A valid .docx needs document.xml only; central directory may contain one item.
 assert.match((await inspectOfficeDocument(file('deflated.docx',packed))).excerpt,/압축 문서 검증/);
 assert.ok(extra.length>100);
});
test('source UI must preserve non-upload privacy and explicit unsupported formatting claims',()=>{
 const ui=readFileSync(new URL('../proposal/client.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../proposal/index.html',import.meta.url),'utf8');
 assert.match(ui,/inspectOfficeDocument\(file\)/);
 assert.match(ui,/원본 서식 보존·근거 사실 확인/);
 assert.match(html,/원본 양식·표·그림 보존/);
 assert.match(html,/서버에 업로드하거나 자동 게시되지 않습니다/);
});
