import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectEditionMediaPair } from '../scripts/verify-publishing-media-pair.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const bookId='BOOK-EKODI-000001',edition='Digital First Edition · v1.7';
const mockEpub=async ({expected})=>({
  bookId:expected.bookId,edition:expected.edition,sha256:expected.sha256,
  technicalStatus:'passed_automated_only',releaseReady:false,
  blockers:[],validators:{
    epubcheck:{valid:true,errors:0,warnings:0},
    ace:{valid:true,violations:0},
  },
});
const frame=seed=>Buffer.concat([Buffer.from([0x49,0x44,0x33,0x04]),Buffer.alloc(180,seed)]);
async function fixture(consume){
  const root=await mkdtemp(path.join(tmpdir(),'ekodi-media-pair-'));
  const chapters=[
    {number:1,title:'1장',file:'one.mp3'},
    {number:2,title:'2장',file:'two.mp3'},
  ];
  const content=[frame(1),frame(2)];
  await Promise.all(chapters.map((c,i)=>writeFile(path.join(root,c.file),content[i])));
  const catalog={books:[{id:bookId,edition}]};
  const approved={
    bookId,edition,epubSha256:sha('fictional pinned epub only for unit test'),
    audioChapters:chapters.map((c,i)=>({number:c.number,title:c.title,sha256:sha(content[i])})),
  };
  const audioSubmission={bookId,edition,chapters};
  try{
    await consume({catalog,approved,audioSubmission,audioRoot:root,
      epubFile:path.join(root,'book.epub')});
  }finally{await rm(root,{recursive:true,force:true});}
}
test('two physical MP3 bytes bind to pinned edition, but never permit sales',async()=>{
  await fixture(async inputs=>{
    let calls=0;
    const result=await inspectEditionMediaPair({...inputs,inspectEpub:async x=>{
      calls++;assert.equal(x.expected.sha256,inputs.approved.epubSha256);
      assert.equal(x.expected.edition,edition);
      return mockEpub(x);
    }});
    assert.equal(calls,1);
    assert.equal(result.technicalStatus,'passed_automated_only');
    assert.equal(result.releaseReady,false);
    assert.equal(result.saleReady,false);
    assert.match(result.bundleSha256,/^[a-f0-9]{64}$/);
    assert.equal(result.audio.chapters.length,2);
    assert.equal(result.epub.epubcheck.errors,0);
    assert.ok(!JSON.stringify(result).includes(inputs.audioRoot));
    const again=await inspectEditionMediaPair({...inputs,inspectEpub:mockEpub});
    assert.equal(again.bundleSha256,result.bundleSha256);
  });
});
test('edition mismatch or absent edition cannot bypass preflight',async()=>{
  await fixture(async inputs=>{
    for(const changed of [
      {approved:{...inputs.approved,edition:'v1.8'}},
      {catalog:{books:[{id:bookId,edition:'v1.0'}]}},
      {approved:{...inputs.approved,bookId:'BOOK-EKODI-000002'}},
      {approved:{...inputs.approved,epubSha256:''}},
    ]){
      let count=0;
      const r=await inspectEditionMediaPair({...inputs,...changed,inspectEpub:async()=>{
        count++;return mockEpub({expected:inputs.approved});
      }});
      assert.equal(r.technicalStatus,'blocked');
      assert.equal(count,0);
      assert.equal(r.saleReady,false);
    }
  });
});
test('changed or missing physical audio blocks before official EPUB validators run',async()=>{
  await fixture(async inputs=>{
    await writeFile(path.join(inputs.audioRoot,'one.mp3'),frame(42));
    let calls=0;
    const r=await inspectEditionMediaPair({...inputs,inspectEpub:async()=>{
      calls++;return mockEpub({expected:inputs.approved});
    }});
    assert.equal(r.technicalStatus,'blocked');
    assert.ok(r.blockers.includes('audio.chapter.1.edition_or_digest_mismatch'));
    assert.equal(calls,0);
  });
});
test('missing chapter, duplicated digest or invalid chapter sequence blocked',async()=>{
  await fixture(async inputs=>{
    const missing={...inputs.audioSubmission,chapters:inputs.audioSubmission.chapters.slice(0,1)};
    const one=await inspectEditionMediaPair({...inputs,audioSubmission:missing,inspectEpub:mockEpub});
    assert.equal(one.technicalStatus,'blocked');
    assert.ok(one.blockers.includes('audio.chapter_count_mismatch'));
    const duplicated={...inputs.approved,audioChapters:[
      inputs.approved.audioChapters[0],{...inputs.approved.audioChapters[1],sha256:inputs.approved.audioChapters[0].sha256},
    ]};
    const two=await inspectEditionMediaPair({...inputs,approved:duplicated,inspectEpub:mockEpub});
    assert.ok(two.blockers.includes('approved.audio_chapter.2.duplicate_digest'));
    const sequence={...inputs.approved,audioChapters:[
      {...inputs.approved.audioChapters[0],number:3},inputs.approved.audioChapters[1],
    ]};
    const three=await inspectEditionMediaPair({...inputs,approved:sequence,inspectEpub:mockEpub});
    assert.ok(three.blockers.includes('approved.audio_chapter.1.invalid'));
  });
});
test('a missing validator, EPUBCheck warning, failed Ace, or wrong SHA blocks release',async()=>{
  await fixture(async inputs=>{
    const results=[
      null,
      { ...(await mockEpub({expected:inputs.approved})),validators:{
        epubcheck:{valid:true,errors:0,warnings:1},ace:{valid:true,violations:0}}},
      { ...(await mockEpub({expected:inputs.approved})),validators:{
        epubcheck:{valid:true,errors:0,warnings:0},ace:{valid:true,violations:1}}},
      { ...(await mockEpub({expected:inputs.approved})),sha256:'f'.repeat(64)},
    ];
    for(const response of results){
      const r=await inspectEditionMediaPair({...inputs,inspectEpub:async()=>response});
      assert.equal(r.technicalStatus,'blocked');
      assert.ok(r.blockers.includes('epub.formal_qa_failed'));
      assert.equal(r.bundleSha256,null);
      assert.equal(r.saleReady,false);
    }
  });
});
test('untrusted catalog cannot create an apparently approved pair',async()=>{
  await fixture(async inputs=>{
    const result=await inspectEditionMediaPair({...inputs,catalog:{books:[
      {id:bookId,edition},{id:bookId,edition},
    ]},inspectEpub:mockEpub});
    assert.ok(result.blockers.includes('catalog.book_missing_or_duplicate'));
    const other=await inspectEditionMediaPair({...inputs,catalog:{books:[
      {id:'BOOK-EKODI-000002',edition:''},
    ]},inspectEpub:mockEpub});
    assert.ok(other.blockers.includes('catalog.book_missing_or_duplicate'));
  });
});

test('audio changed while EPUBCheck/Ace runs is never marked as a stable pair',async()=>{
  await fixture(async inputs=>{
    const r=await inspectEditionMediaPair({...inputs,inspectEpub:async request=>{
      await writeFile(path.join(inputs.audioRoot,'two.mp3'),frame(99));
      return mockEpub(request);
    }});
    assert.equal(r.technicalStatus,'blocked');
    assert.ok(r.blockers.includes('audio.changed_during_epub_validation'));
    assert.equal(r.bundleSha256,null);
    assert.equal(r.saleReady,false);
    assert.equal(r.releaseReady,false);
  });
});
