import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('both first-party header runtimes add compose only to same-origin Voices link',async()=>{
  const [home,boardAsset,audit]=await Promise.all([
    read('sites/seonammedi/public/central-category-runtime.js'),
    read('sites/seonammedi/public/board-central-category.js'),
    read('scripts/verify-seonammedi-nav-guest-native.mjs')
  ]);
  for(const script of [home,boardAsset]){
    assert.match(script,/target\.origin!==location\.origin/);
    assert.match(script,/target\.searchParams\.set\('compose','1'\)/);
    assert.match(script,/voiceLink\.href=target\.href/);
    assert.doesNotMatch(script,/localStorage\.getItem/);
  }
  assert.match(audit,/citizen_header_google_return_or_purpose_mismatch/);
  assert.match(audit,/citizen_header_compose_intent_missing/);
  assert.match(audit,/record\.voiceHeaderAuthMatches=await authRequest/);
});
test('standalone Board authenticates only intentional compose and never redirects in a loop',async()=>{
  const [source,home]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('sites/seonammedi/public/index.html')
  ]);
  assert.match(home,/href="board\/voices">시민의견<\/a>/,'static public guest link remains available');
  assert.match(source,/const VOICE_COMPOSE_AUTH_KEY=/);
  assert.match(source,/sessionStorage\.getItem\(VOICE_COMPOSE_AUTH_KEY\)/);
  assert.match(source,/if\(last&&Date\.now\(\)-last<180000\)return false/);
  assert.match(source,/else if\(!authReturnAttempted&&autoVoiceComposeAuthAllowed\(\)\)\{voiceLogin\("compose"\)\}/);
  assert.match(source,/if\(allowed\)\{clearVoiceComposeAuthAttempt\(\);write\.hidden=false/);
  assert.match(source,/status\.textContent="Google 인증을 완료하지 못했습니다/);
  assert.match(source,/auth\.searchParams\.set\("return_to",target\.href\)/);
  assert.match(source,/auth\.searchParams\.set\("purpose","seonammedi-board-write"\)/);
  for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const res=await board.fetch(new Request(url),{});
    assert.equal(res.status,200);
    const html=await res.text();
    const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    assert.doesNotThrow(()=>new Script(script));
    assert.match(script,/autoVoiceComposeAuthAllowed/);
    assert.match(script,/verifyVoiceAccount\(\)/);
    assert.match(script,/authReturnAttempted/);
  }
});
