import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {monthlyEditorialSlots} from '../publishing/human/editorial-policy.js';
import {validatePrivateManuscript,buildPrivateEpubBytes,preparePrivateEpub} from '../scripts/build-private-human-epub.mjs';
import {inspectEpubMaster} from '../scripts/verify-epub-master.mjs';

const month='2026-10',fieldId='literature';
const manuscript=()=>({
  month,fieldId,slotId:monthlyEditorialSlots(month).find(x=>x.fieldId===fieldId).id,
  bookId:'HUMAN-BOOK-202610-A01',editionId:'HUMAN-EDITION-202610-A01',
  date:'2026-10-30',language:'ko',
  title:'마을의 작은 길과 새로운 이야기',authorDisplay:'출판 작가 검토용',
  chapters:[
    {title:'첫 번째 문장 & 공동체',
     body:('바다가 보이는 마을에서 원고의 진정성을 살피고 책의 문장과 리듬을 검토합니다. ').repeat(10)+'<script>alert(1)</script>'},
    {title:'두 번째 장의 생각',
     body:('함께 살아가는 이웃들의 시선을 기록하며 권리와 사실 확인의 과정을 설명합니다. ').repeat(10)}
  ]
});
const zipFiles=bytes=>{
  let off=0;const map=new Map();
  while(off+30<bytes.length&&bytes.readUInt32LE(off)===0x04034b50){
    const method=bytes.readUInt16LE(off+8),len=bytes.readUInt32LE(off+18),
      n=bytes.readUInt16LE(off+26),extra=bytes.readUInt16LE(off+28);
    const name=bytes.subarray(off+30,off+30+n).toString();
    const body=bytes.subarray(off+30+n+extra,off+30+n+extra+len);
    map.set(name,method===8?inflateRawSync(body).toString():body.toString());
    off+=30+n+extra+len;
  }
  return map;
};
test('builds a real deterministic EPUB3 private draft from operator manuscript; no invented title or publication',async()=>{
  const raw=manuscript();
  const a=buildPrivateEpubBytes(raw),b=buildPrivateEpubBytes(raw);
  assert.deepEqual(a.bytes,b.bytes);
  assert.equal(a.identity.slotId,'HUMAN-202610-literature');
  assert.equal(a.identity.chapters,2);
  assert.equal(a.bytes.subarray(0,4).readUInt32LE(),0x04034b50);
  const resources=zipFiles(a.bytes);
  assert.equal([...resources.keys()][0],'mimetype');
  assert.equal(resources.get('mimetype'),'application/epub+zip');
  assert.ok(resources.get('OEBPS/nav.xhtml').includes('첫 번째 문장 &amp; 공동체'));
  assert.ok(resources.get('OEBPS/text/ch01.xhtml').includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!resources.get('OEBPS/text/ch01.xhtml').includes('<script>'));
  assert.equal(resources.size,7);
});
test('real private disk output passes existing EPUB3 integrity scanner, but always remains unapproved',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ekodi-human-epub-'));
  try{
    const folder=path.join(root,'private');await mkdir(folder);
    const sourceFile=path.join(folder,'input.json'),outputFile=path.join(folder,'draft.epub');
    await writeFile(sourceFile,JSON.stringify(manuscript()));
    const report=await preparePrivateEpub({privateRoot:root,sourceFile,outputFile});
    assert.equal(report.structuralStatus,'passed_unapproved_draft');
    assert.equal(report.releaseReady,false);assert.equal(report.saleReady,false);
    assert.equal(report.epubcheckPassed,false);assert.equal(report.acePassed,false);
    assert.equal(report.publisherApproved,false);assert.equal(report.modelsCalled,0);
    assert.equal(report.resourceCount,7);
    const scanned=await inspectEpubMaster({file:outputFile,expected:{
      bookId:'HUMAN-BOOK-202610-A01',edition:'HUMAN-EDITION-202610-A01',
      sha256:report.sha256
    }});
    assert.equal(scanned.technicalStatus,'passed');
    assert.equal(scanned.approvedDigestMatched,true);
    const bytes=await readFile(outputFile);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),report.sha256);
    const outputStat=await stat(outputFile);assert.equal(outputStat.mode&0o777,0o600);
    await assert.rejects(preparePrivateEpub({privateRoot:root,sourceFile,outputFile}),/EEXIST/);
    assert.equal((await readFile(outputFile)).toString('hex'),bytes.toString('hex'));
  }finally{await rm(root,{recursive:true,force:true});}
});
test('malformed title, nonmatching field, EKODIAN series, fabricated missing manuscript and oversized chapter fail closed',()=>{
  const m=manuscript();
  assert.equal(validatePrivateManuscript(m).chapters.length,2);
  for(const variant of [
    {...m,title:''},{...m,slotId:'not-real'},
    {...m,collectionId:'ekodian'}, {...m,seriesId:'EKODIAN'},
    {...m,authorDisplay:''},{...m,language:'xx'}, {...m,date:'2026-10-99'},
    {...m,chapters:[]},{...m,chapters:[{title:'empty',body:'too short'}]},
    {...m,chapters:[m.chapters[0],{...m.chapters[0]}]},
  ])assert.throws(()=>buildPrivateEpubBytes(variant));
});
test('private-root boundary blocks accidental writes into repository or external folders',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ekodi-human-root-'));
  const outsider=await mkdtemp(path.join(tmpdir(),'ekodi-human-other-'));
  try{
    const sourceFile=path.join(root,'source.json');
    await writeFile(sourceFile,JSON.stringify(manuscript()));
    await assert.rejects(preparePrivateEpub({privateRoot:root,sourceFile,
      outputFile:path.join(outsider,'book.epub')}),/source_or_output_outside_private_root/);
    await assert.rejects(preparePrivateEpub({privateRoot:process.cwd(),sourceFile,
      outputFile:path.join(root,'book.epub')}),/private_root_inside_checkout_denied/);
  }finally{await rm(root,{recursive:true,force:true});await rm(outsider,{recursive:true,force:true});}
});
test('private EPUB builder has no AI API, remote upload, commerce, write-to-repository or approval bypass',async()=>{
  const s=await readFile(new URL('../scripts/build-private-human-epub.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/fetch\(|api\.openai\.com|chatgpt\.com|stripe|paymentIntents|wrangler deploy|releaseReady:true/);
  assert.match(s,/flag:'wx',mode:0o600/);
  assert.match(s,/inspectEpubMaster/);
  assert.match(s,/publisherApproved:false/);
  assert.match(s,/modelCalls|modelsCalled:0/);
});
