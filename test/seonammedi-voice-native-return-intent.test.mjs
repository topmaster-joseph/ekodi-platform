import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const verifier=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-seonammedi-nav-guest-native.yml',import.meta.url),'utf8');

test('native Chromium guest audit confirms compose return and single identity flow',()=>{
  for(const marker of [
    "root.origin+root.prefix+'/board/voices?compose=1'",
    "record.composeReturnMatches",
    "record.singleLoginControl",
    "guest_compose_original_return_lost",
    "duplicate_voice_login_or_manage_control",
    "u.searchParams.get('return_to')===expectedReturn",
    "u.searchParams.get('site')==='seonammedi'",
    "root.name+'-'+device.name",
  ])assert.ok(verifier.includes(marker),marker);
  assert.ok(verifier.includes("name:'desktop'") && verifier.includes("name:'mobile'"));
  assert.ok(verifier.includes("origin:'https://seonammedi.kr'"));
  assert.ok(verifier.includes("origin:'https://ekodi.kr'"));
});

test('native guest audit checks both server authorization gates without credentials or mutation',()=>{
  for(const marker of [
    "'/board/api/auth/session'",
    "'/board/api/admin/posts'",
    "record.guestVoiceApiStatuses",
    "guest_voice_session_gate_",
    "guest_voice_admin_gate_",
    "maxRedirects:0",
    "route.abort('blockedbyclient')",
  ])assert.ok(verifier.includes(marker),marker);
  assert.match(verifier,/status!==401\&\&status!==403/);
});

test('owner-driven native Chromium audit remains trusted and read-only',()=>{
  assert.ok(workflow.includes("github.event.comment.user.login == github.repository_owner"));
  assert.ok(workflow.includes("github.event.issue.state == 'closed'"));
  assert.ok(workflow.includes("body == 'EKODI-SEONAM-NATIVE-AUDIT:RUN'"));
  assert.ok(workflow.includes('  contents: read'));
  assert.ok(!workflow.includes('  contents: write'));
  assert.ok(workflow.includes('node scripts/verify-seonammedi-nav-guest-native.mjs'));
});
