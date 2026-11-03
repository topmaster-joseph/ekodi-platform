import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const code=resolve('scripts/ekodi-voice/approve-devotion-narration.mjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const date='2026-11-03';
const textSha='a'.repeat(64);
const modelRevision='724fb5abbf5502583fb520898d45929e62f02c0b';
const cmd=(...a)=>execFileSync(...a,{stdio:'pipe'});
let ffmpegPresent=true;
try{cmd('ffmpeg',['-version']);cmd('ffprobe',['-version']);}catch{ffmpegPresent=false;}
function prepare() {
  const work=mkdtempSync(join(tmpdir(),'ekodi-preset-approval-test-'));
  const draft=join(work,'draft'),out=join(work,'approved');
  mkdirSync(draft);
  const tracks={};
  for(const [gender,freq,preset] of [['male',320,'M4'],['female',490,'F5']]) {
    const file=join(draft,gender+'.mp3');
    cmd('ffmpeg',['-y','-hide_banner','-loglevel','error',
      '-f','lavfi','-i',`sine=frequency=${freq}:duration=7.5`,
      '-c:a','libmp3lame','-b:a','128k',file]);
    const bytes=readFileSync(file);
    tracks[gender]={file:gender+'.mp3',preset,sha256:sha(bytes),
      durationSec:7.5,sizeBytes:bytes.length};
  }
  const provenance={
    schema:'ekodi.devotion.audio-draft.v1',status:'draft-unapproved',date,
    sourceScriptSha256:textSha,model:'supertonic-3',modelRevision,
    pythonPackage:'supertonic==1.3.1',modelLicense:'OpenRAIL-M',
    packageLicense:'MIT',speakerCloning:false,
    syntheticVoiceDisclosureRequired:true,tracks
  };
  writeFileSync(join(draft,'draft-provenance.json'),JSON.stringify(provenance));
  const review={
    date,scriptSha256:textSha,voiceSource:'licensed-stock-preset',
    publisherApproval:true,rightsApproved:true,textIntegrityApproved:true,
    voicePerformanceApproved:true,accessibilityApproved:true,
    reviewer:'synthetic-review-in-test-only',reviewedAt:'2026-11-03T10:00:00Z',
    modelLicenseApproved:true,stockPresetRightsApproved:true,
    syntheticSpeechDisclosureApproved:true
  };
  const reviewFile=join(work,'review.json');
  const saveReview=r=>writeFileSync(reviewFile,JSON.stringify(r));
  saveReview(review);
  const publish=()=>cmd(process.execPath,[code,date,draft,reviewFile,out]);
  return {draft,out,work,review,reviewFile,saveReview,publish,provenance};
}
test('no review means no public male or female voice files',()=> {
  const src=readFileSync(code,'utf8');
  assert.match(src,/review\.voicePerformanceApproved/);
  assert.match(src,/review\.syntheticSpeechDisclosureApproved/);
  assert.match(src,/sourceScriptSha256/);
  assert.match(src,/stock_master_changed_since_review/);
});
test('stock pretrained voices need verified license, synthetic disclosure and human QA', {skip:!ffmpegPresent},()=>{
 const fixture=prepare();
 try{
  fixture.saveReview({...fixture.review,modelLicenseApproved:false});
  assert.throws(fixture.publish);
  assert.equal(existsSync(fixture.out),false);
  fixture.saveReview({...fixture.review,syntheticSpeechDisclosureApproved:false});
  assert.throws(fixture.publish);
  fixture.saveReview({...fixture.review,voicePerformanceApproved:false});
  assert.throws(fixture.publish);
  fixture.saveReview({...fixture.review,stockPresetRightsApproved:false});
  assert.throws(fixture.publish);
  fixture.saveReview(fixture.review);
  fixture.provenance.tracks.female.sha256='f'.repeat(64);
  writeFileSync(join(fixture.draft,'draft-provenance.json'),JSON.stringify(fixture.provenance));
  assert.throws(fixture.publish);
  assert.equal(existsSync(fixture.out),false);
 }finally{rmSync(fixture.work,{recursive:true,force:true});}
});
test('a fully reviewed matching preset pair emits exactly the guarded daily public manifest', {skip:!ffmpegPresent},()=>{
 const fixture=prepare();
 try{
  fixture.publish();
  const saved=JSON.parse(readFileSync(join(fixture.out,date,'manifest.json'),'utf8'));
  assert.equal(saved.status,'approved');
  assert.equal(saved.source.kind,'licensed-stock-preset');
  assert.equal(saved.source.model,'supertonic-3');
  assert.equal(saved.source.synthetic,true);
  assert.equal(saved.source.modelLicense,'OpenRAIL-M');
  assert.deepEqual(saved.source.voices,{male:'M4',female:'F5'});
  for(const g of ['male','female']) {
   const path=join(fixture.out,date,g+'.mp3');
   assert.equal(saved.tracks[g].sha256,sha(readFileSync(path)));
  }
 }finally{rmSync(fixture.work,{recursive:true,force:true});}
});
