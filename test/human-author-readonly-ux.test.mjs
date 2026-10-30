import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mayAppendHumanInterview } from '../author/human-writer-entitlement.js';

const userId='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const now=Date.UTC(2026,9,29);
const base=()=>({
  userId,
  enrollment:{owner_user_id:userId,writing_mode:'human',plan_id:'writer3',status:'active'},
  subscription:{owner_user_id:userId,plan_id:'writer3',status:'active',verified_payment_at:'2026-10-20T10:00:00.000Z',paid_until:'2026-11-29T00:00:00.000Z'},
  now
});

test('editable only for valid owned paid enrollment in current verified term',()=>{
  assert.equal(mayAppendHumanInterview(base()),true);
  const mutations=[
    x=>{x.enrollment.status='archived'},
    x=>{x.enrollment.status='completed'},
    x=>{x.enrollment.writing_mode='simple'},
    x=>{x.subscription.status='cancelled'},
    x=>{x.subscription.status='past_due'},
    x=>{x.subscription.status='suspended'},
    x=>{x.subscription.plan_id='writer1'},
    x=>{x.subscription.verified_payment_at=null},
    x=>{x.subscription.paid_until='2026-10-28T00:00:00.000Z'},
    x=>{x.subscription.paid_until='not-a-timestamp'},
    x=>{x.enrollment.owner_user_id=other},
    x=>{x.subscription.owner_user_id=other},
    x=>{x.userId=other}
  ];
  for(const change of mutations){const fixture=base();change(fixture);assert.equal(mayAppendHumanInterview(fixture),false,JSON.stringify(fixture));}
  const missing=base();missing.subscription=null;assert.equal(mayAppendHumanInterview(missing),false);
  const past=base();past.now=Date.parse(past.subscription.paid_until);assert.equal(mayAppendHumanInterview(past),false);
});

test('UI rechecks with RLS for each append and never replaces owner history with billing gate',()=>{
  const source=readFileSync(new URL('../author/human-writer.js',import.meta.url),'utf8');
  assert.match(source,/from\('human_author_enrollments'\).*select\('id,owner_user_id,status,writing_mode,plan_id'\)/);
  assert.match(source,/from\('human_author_subscriptions'\).*select\('owner_user_id,plan_id,status,verified_payment_at,paid_until'\)/);
  assert.match(source,/await refresh\(\);try\{await loadEntitlement\(\)/);
  assert.match(source,/answer\.readOnly=!writeEnabled/);
  assert.match(source,/if\(!\(await verifyBeforeWrite\(\)\)\)/);
  assert.match(source,/from\('human_author_interview_turns'\)\.insert/);
  assert.match(source,/기존 원고는 유지됩니다/);
  assert.match(source,/출판 승인은 별도입니다/);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE|api[.]openai[.]com|js[.]tosspayments[.]com/);
});
