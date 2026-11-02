import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyDraft} from '../scripts/ekodi-voice/audit-stock-devotion-draft.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const male=Buffer.alloc(5500,4);male.set([0x49,0x44,0x33],0);
const female=Buffer.alloc(5600,5);female.set([0x49,0x44,0x33],0);
const date='2026-11-02',source={date,sha256:'c'.repeat(64)};
const track=(id,file,bytes,sec)=>({voiceId:id,file,durationSec:sec,sha256:hash(bytes),approved:false});
const manifest={
 schema:'ekodi.devotion.stock-narrator.draft.v1',date,language:'ko-KR',
 sourceScriptSha256:source.sha256,status:'draft',approved:false,
 model:'Supertone/supertonic-3',modelLicense:'OpenRAIL-M',
 licensedSource:'stock-built-in-voice-styles',aiGeneratedDisclosure:'에코디 AI가 생성한 낭독음성입니다.',
 review:{rights:false,textIntegrity:false,voicePerformance:false,accessibility:false},
 tracks:{male:track('M1','male.mp3',male,187.9),female:track('F1','female.mp3',female,187.7)}
};
const audit=(m=manifest,s=source,files={male,female},duration={male:187.9,female:187.7})=>verifyDraft(m,date,s,files,duration);
test('valid independent private R2 readback verifies source date, separate AI voices, MP3 integrity and duration',()=>{
 assert.deepEqual(audit(),{date,approved:false,maleDurationSec:187.9,femaleDurationSec:187.7});
});
test('fail closed for approvals, edited Scripture, wrong voice, missing MP3, tampering and duration drift',()=>{
 for(const changed of [
  {...manifest,status:'approved'},
  {...manifest,approved:true},
  {...manifest,review:{...manifest.review,voicePerformance:true}},
  {...manifest,modelLicense:'unverified'},
  {...manifest,tracks:{...manifest.tracks,female:{...manifest.tracks.female,voiceId:'M1'}}},
  {...manifest,aiGeneratedDisclosure:'none'},
 ]) assert.throws(()=>audit(changed));
 assert.throws(()=>audit(manifest,{...source,sha256:'d'.repeat(64)}));
 assert.throws(()=>audit(manifest,source,{male,female:Buffer.alloc(5600,5)}));
 assert.throws(()=>audit(manifest,source,{male}));
 assert.throws(()=>audit(manifest,source,{male,female},{male:187.9,female:191.2}));
});
test('workflow is read-only and never delivers the unreviewed drafts or private voice samples',()=>{
 const wf=readFileSync(new URL('../.github/workflows/audit-ekodi-stock-devotion-draft.yml',import.meta.url),'utf8');
 assert.match(wf,/workflow_dispatch/);
 assert.match(wf,/contents: read/);
 assert.match(wf,/r2 object get/);
 assert.match(wf,/audit-stock-devotion-draft\.mjs/);
 assert.doesNotMatch(wf,/r2 object put|upload-artifact|wrangler deploy|\/bible\/narration\/.*\.mp3/);
 assert.match(wf,/if: always\(\)/);
});
