// Read-only independent verification of the private EKODI stock narrator draft.
// The script must not expose MP3 bodies, R2 keys, source Scripture or speaker data.
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isNarrationDate} from '../../bible/devotion-ekodi-narration.js';

const ID=/^[0-9]{6,20}$/;
const HASH=/^[a-f0-9]{64}$/i;
export function verifyDraft(manifest,date,source,files,durations) {
 if(!isNarrationDate(date)||manifest?.date!==date||source?.date!==date)throw Error('devotional_date_mismatch');
 if(manifest?.schema!=='ekodi.devotion.stock-narrator.draft.v1'||
    manifest?.status!=='draft'||manifest.approved!==false||
    manifest.model!=='Supertone/supertonic-3'||manifest.modelLicense!=='OpenRAIL-M'||
    manifest.licensedSource!=='stock-built-in-voice-styles'||
    !manifest.aiGeneratedDisclosure?.includes('AI')||
    !HASH.test(manifest.sourceScriptSha256||'')||
    manifest.sourceScriptSha256!==source.sha256 ||
    Object.values(manifest.review||{}).some(v=>v!==false) ||
    !['rights','textIntegrity','voicePerformance','accessibility'].every(k=>manifest.review?.[k]===false))
   throw Error('unapproved_provenance_or_source_invalid');
 const result={date,approved:false};
 for(const [gender,id] of [['male','M1'],['female','F1']]){
   const track=manifest.tracks?.[gender],bytes=files?.[gender];
   if(!track||track.file!==gender+'.mp3'||track.voiceId!==id||track.approved!==false ||
      !HASH.test(track.sha256||'')||!(bytes instanceof Uint8Array)||
      bytes.byteLength<=4096||bytes.byteLength>32*1024*1024)
     throw Error('track_missing_or_unapproved_'+gender);
   if(!(bytes[0]===73&&bytes[1]===68&&bytes[2]===51)&&!(bytes[0]===255&&(bytes[1]&224)===224))
     throw Error('invalid_mp3_header_'+gender);
   const digest=createHash('sha256').update(bytes).digest('hex');
   if(digest.toLowerCase()!==track.sha256.toLowerCase())throw Error('track_sha_mismatch_'+gender);
   const actual=durations?.[gender];
   if(!Number.isFinite(actual)||actual<=5||actual>=3600||Math.abs(actual-track.durationSec)>0.6)
      throw Error('track_duration_mismatch_'+gender);
   result[gender+'DurationSec']=Math.round(actual*10)/10;
 }
 if(manifest.tracks.male.sha256===manifest.tracks.female.sha256)throw Error('identical_voice_audio');
 return result;
}
export function verifyLocal(date,dir,sourceFile) {
 const manifest=JSON.parse(readFileSync(join(dir,'draft-manifest.json'),'utf8'));
 const source=JSON.parse(readFileSync(sourceFile,'utf8'));
 const files={},durations={};
 for(const gender of ['male','female']){
   const file=join(dir,gender+'.mp3');
   if(statSync(file).size>32*1024*1024)throw Error('oversized_private_track');
   files[gender]=readFileSync(file);
   const raw=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'});
   durations[gender]=Number(raw.trim());
 }
 return verifyDraft(manifest,date,source,files,durations);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const [date,dir,sourceFile]=process.argv.slice(2);
 try {
   if(!date||!dir||!sourceFile)throw Error('usage: node audit-stock-devotion-draft DATE DIR SOURCE');
   const result=verifyLocal(date,dir,sourceFile);
   process.stdout.write(JSON.stringify(result)+'\n');
 } catch {
   process.stderr.write('EKODI stock narrator private audit FAILED; no track was publicly released.\n');
   process.exitCode=1;
 }
}
