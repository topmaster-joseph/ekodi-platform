import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { inspectEpubMaster } from '../scripts/verify-epub-master.mjs';

const container='<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
const opf=[
  '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">',
  '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My book</dc:title><dc:language>ko</dc:language><dc:identifier id="bookid">test-id</dc:identifier></metadata>',
  '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  '<item id="chapter1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>',
  '<spine><itemref idref="chapter1"/></spine></package>'
].join('\n');
const entries=()=>[
 ['mimetype','application/epub+zip',0],
 ['META-INF/container.xml',container,8],
 ['OEBPS/content.opf',opf,8],
 ['OEBPS/nav.xhtml','<html><body><nav epub:type="toc"><ol><li>Chapter</li></ol></nav></body></html>',8],
 ['OEBPS/chapter.xhtml','<html><body>Chapter text</body></html>',8]
];
function crc32(input){let c=0xffffffff;for(const b of input){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function makeZip(records) {
  const locals=[],central=[];let offset=0;
  for(const record of records){
    const [name,text,method]=record;
    const nameB=Buffer.from(name), bytes=Buffer.from(text), payload=method===8?deflateRawSync(bytes):bytes;
    const crc=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);
    local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);
    local.writeUInt32LE(payload.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(nameB.length,26);
    locals.push(local,nameB,payload);
    const cd=Buffer.alloc(46);cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt16LE(method,10);
    cd.writeUInt32LE(crc,16);cd.writeUInt32LE(payload.length,20);cd.writeUInt32LE(bytes.length,24);cd.writeUInt16LE(nameB.length,28);
    cd.writeUInt32LE(offset,42);central.push(cd,nameB);
    offset+=local.length+nameB.length+payload.length;
  }
  const dir=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(records.length,8);end.writeUInt16LE(records.length,10);
  end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}
async function check(bytes, expected={bookId:'BOOK-EKODI-000001',edition:'v1.0'}){
  const root=await mkdtemp(path.join(tmpdir(),'epubqa-'));
  try{const file=path.join(root,'book.epub');await writeFile(file,bytes);return await inspectEpubMaster({file,expected});}
  finally{await rm(root,{recursive:true,force:true});}
}
test('valid EPUB3 structure returns digest and technical pass, never release approval',async()=>{
  const archive=makeZip(entries());
  const sha256=createHash('sha256').update(archive).digest('hex');
  const r=await check(archive,{bookId:'BOOK-EKODI-000001',edition:'v1.0',sha256});
  assert.equal(r.technicalStatus,'passed');
  assert.equal(r.approvedDigestMatched,true);
  assert.equal(r.resourceCount,5);
  assert.equal(r.spineItems,1);
  assert.equal(r.navigationPresent,true);
  assert.equal(r.releaseReady,false);
  assert.ok(r.releaseBlockers.includes('official_EPUBCheck_and_Ace_validation'));
  assert.ok(!JSON.stringify(r).includes('epubqa-'));
});
test('draft hash mismatch blocks approval even when the ZIP is structurally sound',async()=>{
  const r=await check(makeZip(entries()),{bookId:'BOOK-EKODI-000001',edition:'v1.0',sha256:'0'.repeat(64)});
  assert.equal(r.technicalStatus,'blocked');
  assert.ok(r.blockers.includes('expected_digest_mismatch'));
});
test('invalid EPUB mime, duplicate path, ZIP traversal, and invalid CRC fail closed',async()=>{
  const a=entries();a[0]=['mimetype','application/zip',0];
  assert.ok((await check(makeZip(a))).blockers.includes('epub_mimetype_invalid'));
  assert.ok((await check(makeZip([...entries(),['OEBPS/chapter.xhtml','copy',0]]))).blockers.includes('zip_duplicate_entry'));
  assert.ok((await check(makeZip([...entries(),['../outside','bad',0]]))).blockers.includes('zip_unsafe_name'));
  const corrupt=makeZip(entries());
  corrupt[40]^=0xff;
  assert.equal((await check(corrupt)).technicalStatus,'blocked');
});
test('missing navigation and spine files block technical release preflight',async()=>{
  const withoutNav=entries().filter(x=>x[0]!=='OEBPS/nav.xhtml');
  const nav=await check(makeZip(withoutNav));
  assert.ok(nav.blockers.includes('epub_navigation_missing'));
  assert.ok(nav.blockers.includes('epub_manifest_resource_missing'));
  const spine=entries().filter(x=>x[0]!=='OEBPS/chapter.xhtml');
  const result=await check(makeZip(spine));
  assert.ok(result.blockers.includes('epub_spine_resource_missing'));
});
test('EPUB2 document and missing title/language are never accepted as EPUB3',async()=>{
  const a=entries();a[2]=['OEBPS/content.opf',opf.replace('version="3.0"','version="2.0"').replace(/<dc:language>ko<\/dc:language>/,''),8];
  const r=await check(makeZip(a));
  assert.ok(r.blockers.includes('epub3_package_version_invalid'));
  assert.ok(r.blockers.includes('epub_metadata_incomplete'));
});
test('missing source or missing expected identity block preflight',async()=>{
  const r=await inspectEpubMaster({file:'/not/a/real/epub.epub',expected:{bookId:'one',edition:'v1'}});
  assert.equal(r.technicalStatus,'blocked');
  const noidentity=await check(makeZip(entries()),{});
  assert.ok(noidentity.blockers.includes('expected_identity_missing'));
});
