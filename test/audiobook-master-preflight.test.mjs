import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectAudiobookMaster } from '../scripts/verify-audiobook-master.mjs';

const catalog={books:[{id:'BOOK-EKODI-000001',edition:'Digital First Edition · v1.7'}]};
const submission=chapters=>({
  bookId:'BOOK-EKODI-000001',edition:'Digital First Edition · v1.7',chapters
});
const track=(number,file)=>({number,title:'제'+number+'장',file});
const mp3=value=>Buffer.concat([Buffer.from([0x49,0x44,0x33,0x03,0,0]),Buffer.alloc(260,value)]);

async function fixture(run){
  const root=await mkdtemp(path.join(tmpdir(),'ekodi-audio-'));
  try{
    await writeFile(path.join(root,'1.mp3'),mp3(0x41));
    await writeFile(path.join(root,'2.mp3'),mp3(0x42));
    await run(root);
  }finally{await rm(root,{recursive:true,force:true});}
}

test('accepted technical files never claim full listening or final publishing approval',async()=>{
  await fixture(async root=>{
    const r=await inspectAudiobookMaster({catalog,submission:submission([
      track(1,'1.mp3'),track(2,'2.mp3')
    ]),root});
    assert.equal(r.technicalStatus,'passed');
    assert.equal(r.releaseReady,false);
    assert.equal(r.chapters.length,2);
    assert.equal(r.chapters[0].sha256.length,64);
    assert.ok(r.releaseBlockers.includes('complete_mp3_decode_and_full_listening_qa'));
    assert.ok(!JSON.stringify(r).includes(root));
  });
});

test('reject mismatched edition, missing and unordered chapters, duplicate files and fake MP3',async()=>{
  await fixture(async root=>{
    const wrong=await inspectAudiobookMaster({catalog,submission:{
      ...submission([track(1,'1.mp3')]),edition:'unapproved'
    },root});
    assert.ok(wrong.blockers.includes('catalog.edition_mismatch'));
    const gap=await inspectAudiobookMaster({catalog,submission:submission([track(2,'1.mp3')]),root});
    assert.ok(gap.blockers.includes('chapter.1.sequence_invalid'));
    const missing=await inspectAudiobookMaster({catalog,submission:submission([track(1,'missing.mp3')]),root});
    assert.ok(missing.blockers.includes('chapters.incomplete'));
    const duplicate=await inspectAudiobookMaster({catalog,submission:submission([
      track(1,'1.mp3'),track(2,'1.mp3')
    ]),root});
    assert.ok(duplicate.blockers.includes('chapter.2.duplicate_file'));
    await writeFile(path.join(root,'bad.mp3'),Buffer.alloc(260));
    const bad=await inspectAudiobookMaster({catalog,submission:submission([track(1,'bad.mp3')]),root});
    assert.ok(bad.blockers.includes('chapter.1.not_mp3_header'));
  });
});

test('block absolute paths, parent escapes, and symlink escapes',async()=>{
  await fixture(async root=>{
    for(const file of ['../outside.mp3','/tmp/unknown.mp3','C:\\Users\\example.mp3']){
      const r=await inspectAudiobookMaster({catalog,submission:submission([track(1,file)]),root});
      assert.ok(r.blockers.includes('chapter.1.path_escape')||
                r.blockers.includes('chapter.1.file_invalid'));
    }
    const other=await mkdtemp(path.join(tmpdir(),'ekodi-other-'));
    try{
      await writeFile(path.join(other,'secret.mp3'),mp3(0x31));
      await symlink(path.join(other,'secret.mp3'),path.join(root,'link.mp3'));
      const r=await inspectAudiobookMaster({catalog,submission:submission([track(1,'link.mp3')]),root});
      assert.ok(r.blockers.includes('chapter.1.path_escape'));
    }finally{await rm(other,{recursive:true,force:true});}
  });
});

test('no chapters, missing root, and forged approval flags fail closed',async()=>{
  const r=await inspectAudiobookMaster({
    catalog,submission:{...submission([]),releaseReady:true,publisherApproved:true},
    root:'/not/a/real/path'
  });
  assert.equal(r.technicalStatus,'blocked');
  assert.equal(r.releaseReady,false);
  assert.ok(r.blockers.includes('chapters.count_invalid'));
});
