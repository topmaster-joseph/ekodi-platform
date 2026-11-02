// A gate for real human-reviewed two-speaker EKODI devotion MP3 releases.
// Source speaker samples must be consenting; this tool does not decide consent.
import {readFileSync,mkdirSync,writeFileSync,copyFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isNarrationDate} from '../../bible/devotion-ekodi-narration.js';
const [date,draft,reviewFile,outRoot='bible/narration']=process.argv.slice(2);
if(!isNarrationDate(date)||!draft||!reviewFile)throw Error('usage: node approve-devotion-narration.mjs DATE DRAFT_DIRECTORY REVIEW_JSON [OUT_ROOT]');
const seoulToday = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(date>seoulToday)throw Error('future_devotional_narration_not_public');
const review=JSON.parse(readFileSync(reviewFile,'utf8'));
const isStock = review.voiceSource === 'licensed-stock-preset';
let stockSource = null;
if (isStock) {
  // These are vendor-distributed preset voices, not derived from an identifiable
  // EKODI member's private voice. The model license and audibility still need
  // independent approval; source-provider metadata alone is not a review.
  const draftSource=JSON.parse(readFileSync(join(draft,'draft-provenance.json'),'utf8'));
  if(draftSource.schema!=='ekodi.devotion.audio-draft.v1' ||
      draftSource.status!=='draft-unapproved' ||
      draftSource.date!==date ||
      draftSource.sourceScriptSha256!==review.scriptSha256 ||
      draftSource.model!=='supertonic-3' ||
      draftSource.modelRevision!=='724fb5abbf5502583fb520898d45929e62f02c0b' ||
      draftSource.pythonPackage!=='supertonic==1.3.1' ||
      draftSource.modelLicense!=='OpenRAIL-M' ||
      draftSource.packageLicense!=='MIT' ||
      draftSource.speakerCloning!==false ||
      draftSource.syntheticVoiceDisclosureRequired!==true ||
      draftSource.tracks?.male?.preset!=='M4' ||
      draftSource.tracks?.female?.preset!=='F5')
    throw Error('licensed_stock_model_provenance_mismatch');
  stockSource=draftSource;
}
const hasVoiceRights = isStock
  ? review.modelLicenseApproved===true && review.stockPresetRightsApproved===true &&
    review.syntheticSpeechDisclosureApproved===true
  : Boolean(review.maleSpeakerConsent && review.femaleSpeakerConsent &&
      review.maleSpeakerConsent!==review.femaleSpeakerConsent);
if(review.date!==date || review.publisherApproval!==true ||
  review.rightsApproved!==true || review.textIntegrityApproved!==true ||
  review.voicePerformanceApproved!==true || review.accessibilityApproved!==true ||
  !review.reviewer?.trim() || !review.reviewedAt ||
  !/^[a-f0-9]{64}$/i.test(review.scriptSha256||'') || !hasVoiceRights)
 throw Error('independent human approval and applicable voice source rights are required');
const tracks={};
for(const gender of ['male','female']){
 const path=resolve(draft,gender+'.mp3');
 const bytes=readFileSync(path);
 if(bytes.length<4096||bytes.length>32*1024*1024)throw Error(gender+' mp3 invalid size');
 const id3=bytes[0]===73&&bytes[1]===68&&bytes[2]===51;
 const mpeg=bytes[0]===255&&(bytes[1]&224)===224;
 if(!id3&&!mpeg)throw Error(gender+' audio not mp3');
 const seconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{encoding:'utf8'}).trim());
 if(!Number.isFinite(seconds)||seconds<5||seconds>=3600)throw Error(gender+' duration invalid');
 tracks[gender]={
   file:gender+'.mp3',status:'approved',
   durationSec:Math.round(seconds*10)/10,
   sha256:createHash('sha256').update(bytes).digest('hex'),
 };
}
if(tracks.male.sha256===tracks.female.sha256)throw Error('male/female must use distinct reviewed files');
if (isStock) {
  for(const gender of ['male','female']){
    const source=stockSource.tracks[gender];
    if(source.file!==gender+'.mp3' || source.sha256!==tracks[gender].sha256 ||
       Math.abs(source.durationSec-tracks[gender].durationSec)>1 ||
       !(Number(source.sizeBytes)>4096))
      throw Error('stock_master_changed_since_review:'+gender);
  }
}
const manifest={
 schema:'ekodi.devotion.narration.v1',date,status:'approved',
 language:'ko-KR',sourceScriptSha256:review.scriptSha256,
 source: isStock
   ? {kind:'licensed-stock-preset',model:'supertonic-3',
      modelRevision:'724fb5abbf5502583fb520898d45929e62f02c0b',
      modelLicense:'OpenRAIL-M',synthetic:true,
      voices:{male:'M4',female:'F5'}}
   : {kind:'consented-speakers',synthetic:true},
 review:{rights:true,textIntegrity:true,voicePerformance:true,accessibility:true},
 tracks,
};
// Final release is a repo PR, not a direct deploy. A human signs the review file,
// and EKODI protected CI checks the exact approved media before publishing.
const out=join(outRoot,date);
mkdirSync(out,{recursive:true});
for(const gender of ['male','female'])copyFileSync(resolve(draft,gender+'.mp3'),join(out,gender+'.mp3'));
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({date,files:Object.keys(tracks),out,reviewed:true},null,2));
