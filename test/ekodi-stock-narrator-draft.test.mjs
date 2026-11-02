import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const py = readFileSync(new URL('../scripts/ekodi-voice/render-stock-devotion.py',import.meta.url),'utf8');
const workflow = readFileSync(new URL('../.github/workflows/render-ekodi-stock-devotion-draft.yml',import.meta.url),'utf8');

test('stock narrator uses licensed first-party built-in male and female voices without voice cloning',()=>{
 assert.match(py,/VOICE_PRESETS = \{"male": "M1", "female": "F1"\}/);
 assert.match(py,/get_voice_style\(voice_name=voice_id\)/);
 assert.match(py,/lang="ko"/);
 assert.match(py,/MODEL_LICENSE = "OpenRAIL-M"/);
 assert.doesNotMatch(py,/get_voice_style_from_path|enhance_sample|speaker_embedding|voice_cloning/i);
});
test('public Scripture source date and full text hash must be validated before synthesis',()=>{
 assert.match(py,/Date\.fromisoformat\(date\)/);
 assert.match(py,/ZoneInfo\("Asia\/Seoul"\)/);
 assert.match(py,/date > datetime\.now/);
 assert.match(py,/actual != record\.get\("sha256"\)/);
 assert.match(py,/if not isinstance\(segments, list\)/);
});
test('render result always remains unapproved, discloses AI and carries distinct audio hashes',()=>{
 assert.match(py,/"approved": False/);
 assert.match(py,/"status": "draft"/);
 assert.match(py,/"aiGeneratedDisclosure": "에코디 AI가 생성한 낭독음성입니다\."/);
 assert.match(py,/manifest\["tracks"\]\["male"\]\["sha256"\] == manifest\["tracks"\]\["female"\]\["sha256"\]/);
 assert.match(py,/"voicePerformance": False/);
});
test('manual workflow stores draft only in protected bucket, no production mutation or audiobook sample',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/supertonic==1\.2\.2/);
 assert.match(workflow,/render-stock-devotion\.py/);
 assert.match(workflow,/_voice\/devotion-drafts/);
 assert.doesNotMatch(workflow,/r2 object put.*\/bible\/narration|deploy-cloudflare|wrangler deploy|upload-artifact|speaker-sample|male-sample|female-sample/);
 assert.match(workflow,/if: always\(\)/);
});
