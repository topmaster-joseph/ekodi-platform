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
if(review.date!==date || review.publisherApproval!==true ||
  review.rightsApproved!==true || review.textIntegrityApproved!==true ||
  review.voicePerformanceApproved!==true || review.accessibilityApproved!==true ||
  !review.reviewer?.trim() || !review.reviewedAt ||
  !/^[a-f0-9]{64}$/i.test(review.scriptSha256||'') ||
  !review.maleSpeakerConsent || !review.femaleSpeakerConsent ||
  review.maleSpeakerConsent === review.femaleSpeakerConsent)
 throw Error('independent human approvals for both consented voices and the exact script required');
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
const manifest={
 schema:'ekodi.devotion.narration.v1',date,status:'approved',
 language:'ko-KR',sourceScriptSha256:review.scriptSha256,
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
