import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const audit=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
test('two-origin guest audit detects top Voices compose intention rather than testing a stale Notice button',()=>{
  assert.match(audit,/citizen_header_compose_intent_missing/);
  assert.match(audit,/citizen_header_google_return_or_purpose_mismatch/);
  assert.match(audit,/const expectedVoice=root\.origin\+root\.prefix\+'\/board\/voices\?compose=1'/);
  assert.match(audit,/record\.voiceHeaderAuthMatches=await authRequest/);
  assert.match(audit,/u\.searchParams\.get\('return_to'\)===expectedVoice/);
  assert.match(audit,/u\.searchParams\.get\('purpose'\)==='seonammedi-board-write'/);
  assert.match(audit,/citizen_header_context_restore_failed/);
});
test('browser proof remains read only, mount-aware, desktop and mobile',()=>{
  assert.match(audit,/root\.origin\+root\.prefix\+suffix/);
  assert.match(audit,/name:'desktop'/);
  assert.match(audit,/name:'mobile'/);
  assert.match(audit,/route\.abort\('blockedbyclient'\)/);
  assert.match(audit,/if\(!\['GET','HEAD','OPTIONS'\]\.includes\(method\)\)/);
});
