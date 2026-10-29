import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseBillingIdentity, loadBillingIdentity,
  personalSubscriptionLookupKeys, choosePersonalSubscription, saveVerifiedBillingAliases, recurringBillingCollision,
} from '../membership-identity.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const PERSON = 'c48a7cb7-6c49-4829-8e4d-63d22f31127b';
const USER_GOOGLE = '3775b004-562b-4b45-8996-e24a8963009b';
const USER_KAKAO = '69950dad-9b7c-4ab5-82a4-cd2eead33ab7';
const USER_STRANGER = '9245cbd0-0862-42c9-b6c4-b346876e6db3';
const proof = {
  person_id: PERSON,
  ekodi_id: 'EKODI-MEMBER-1',
  auth_user_ids: [USER_GOOGLE, USER_KAKAO],
  verified_emails: ['member@example.com'],
};
const user = (id, email = 'identity+kakao.1234567890abcdef1234567890abcdef@ekodi.kr') => ({id,email});

test('two proven login methods produce exactly the same paid subject key', () => {
  const google = parseBillingIdentity(proof, user(USER_GOOGLE, 'member@example.com'));
  const kakao = parseBillingIdentity(proof, user(USER_KAKAO));
  assert.equal(google.subjectKey, 'person:' + PERSON);
  assert.equal(kakao.subjectKey, google.subjectKey);
  assert.equal(kakao.email, 'member@example.com');
  assert.deepEqual(personalSubscriptionLookupKeys(kakao), ['person:' + PERSON, PERSON, USER_GOOGLE, USER_KAKAO]);
});

test('provider email equality without an authenticated link is not enough', () => {
  assert.equal(parseBillingIdentity(proof, user(USER_STRANGER, 'member@example.com')), null);
  assert.equal(parseBillingIdentity({...proof, person_id:null}, user(USER_GOOGLE)), null);
  assert.equal(parseBillingIdentity({...proof, ekodi_id:null}, user(USER_GOOGLE)), null);
  assert.equal(parseBillingIdentity({...proof, auth_user_ids:[]}, user(USER_GOOGLE)), null);
});

test('server proof must come from the signed-in caller and fail closed on errors', async () => {
  let call;
  const verified = await loadBillingIdentity({
    accessToken:'test-token',authUser:user(USER_KAKAO),
    supabaseUrl:'https://example.invalid', publishableKey:'public',
    fetchImpl:async (url,options) => {
      call={url,options};
      return {ok:true,json:async()=>proof};
    },
  });
  assert.equal(verified.subjectKey,'person:'+PERSON);
  assert.match(call.url,/\/rpc\/current_ekodi_billing_identity$/);
  assert.equal(call.options.headers.authorization,'Bearer test-token');
  assert.equal(call.options.method,'POST');
  assert.equal(await loadBillingIdentity({
    accessToken:'test-token',authUser:user(USER_GOOGLE),
    supabaseUrl:'https://example.invalid',publishableKey:'public',
    fetchImpl:async()=>({ok:false}),
  }),null);
});

test('legacy paid entitlement wins over newly-created canonical FREE', () => {
  const free={plan_id:'free', status:'free',monthly_fee:0,subject_key:'person:'+PERSON};
  const paid={plan_id:'pro',status:'active',monthly_fee:39900,subject_key:USER_GOOGLE};
  assert.equal(choosePersonalSubscription([free,paid]),paid);
  assert.equal(choosePersonalSubscription([paid,free]),paid);
});

test('two active paid subscriptions require reconciliation, never take the highest plan', () => {
  const one={plan_id:'plus',status:'active',monthly_fee:9900,subject_key:USER_GOOGLE};
  const two={plan_id:'pro',status:'active',monthly_fee:39900,subject_key:USER_KAKAO};
  assert.throws(()=>choosePersonalSubscription([one,two]),{code:'ACCOUNT_BILLING_RECONCILIATION_REQUIRED'});
  assert.throws(()=>choosePersonalSubscription([{...one,status:'past_due'},two,{...two,subject_key:PERSON}]),
    {code:'ACCOUNT_BILLING_RECONCILIATION_REQUIRED'});
});

test('cancelled paid history is retained for audit, not silently replaced by FREE', () => {
  const cancelled={plan_id:'plus',status:'canceled',monthly_fee:9900};
  assert.equal(choosePersonalSubscription([{plan_id:'free',status:'free',monthly_fee:0},cancelled]),cancelled);
});

test('membership billing and portfolio read proven aliases, not provider email matches',()=>{
  const billing=read('membership-billing.js');
  const universal=read('universal-membership.js');
  const migration=read('supabase/migrations/20261030010000_current_ekodi_billing_identity.sql');
  assert.match(billing,/loadBillingIdentity\(/);
  assert.match(billing,/key:identity\.subjectKey/);
  assert.match(billing,/choosePersonalSubscription\(rows\)/);
  assert.match(billing,/identity\.verifiedEmails\?\.includes/);
  assert.match(billing,/new URL\('https:\/\/ekodi\.kr\/auth\/'\)/);
  assert.match(universal,/choosePersonalSubscription\(rows\)/);
  assert.match(universal,/legacySubjectKeys/);
  assert.match(migration,/auth\.uid\(\)/);
  assert.match(migration,/public\.ekodi_account_for_auth_user\(v_auth_user_id\)/);
  assert.match(migration,/grant execute on function public\.current_ekodi_billing_identity\(\) to authenticated;/);
  assert.doesNotMatch(migration,/\bdrop (table|column)\b/i);
});

test('the default administrator form is hidden; UI label is not an authorization gate',()=>{
  const html=read('admin-shell.html');
  const handoff=read('admin-central-handoff.js');
  const control=read('control.js');
  assert.match(html,/<form id="loginForm" hidden>/);
  assert.match(html,/>로그인<\/a>/);
  assert.match(handoff,/link\.textContent='로그인'/);
  assert.match(control,/link\.textContent='로그인'/);
  assert.match(handoff,/\/api\/session/);
});

test('independently registered Persons cannot merge before recurring billing reconciliation',()=>{
  const api=read('supabase/functions/identity-api/index.ts');
  const ui=read('auth-site/federated-login.js');
  const link=api.slice(api.indexOf('async function finishLink'),api.indexOf('async function disconnectIdentity'));
  assert.match(link,/targetPersonId&&targetPersonId!==initiatorPersonId/);
  assert.match(link,/error:"account_merge_review_required"/);
  assert.ok(link.indexOf('targetPersonId&&targetPersonId!==initiatorPersonId')<
    link.indexOf('admin.rpc("link_person_identity"'),'check must precede merge transaction');
  assert.match(ui,/code === 'account_merge_review_required'/);
});

function memoryD1(initialSubs = []) {
  const aliases=new Map();
  const subscriptions=initialSubs;
  const prepare=sql=>({
    bind(...args) {
      return {
        async run() {
          if(sql.startsWith('INSERT OR IGNORE INTO membership_person_aliases')) {
            if(!aliases.has(args[0])) aliases.set(args[0],args[1]);
          }
          return {success:true};
        },
        async first() {
          if(sql.startsWith('SELECT person_key FROM membership_person_aliases'))
            return aliases.has(args[0])?{person_key:aliases.get(args[0])}:null;
          if(sql.includes('JOIN membership_person_aliases a'))
            return {count:subscriptions.filter(s=>
              s.subject_type==='person'&&s.site===args[1]&&
              aliases.get(s.subject_key)===args[0]&&s.monthly_fee>0&&
              ['active','trialing','grace','past_due'].includes(s.status)).length};
          throw Error('Unmocked SQL: '+sql);
        }
      };
    },
    async run() { return {success:true}; }
  });
  return {db:{prepare, async batch(stmts) { for(const s of stmts) await s.run(); }},
    aliases,subscriptions};
}
test('server-proved aliases are written in a batch and reveal duplicate scheduled charges',async()=>{
  const google=parseBillingIdentity(proof,user(USER_GOOGLE));
  const kakao=parseBillingIdentity(proof,user(USER_KAKAO));
  const {db,aliases}=memoryD1([
    {subject_type:'person',subject_key:USER_GOOGLE,site:'marketing',monthly_fee:9900,status:'active'},
    {subject_type:'person',subject_key:USER_KAKAO,site:'marketing',monthly_fee:39900,status:'active'},
  ]);
  await saveVerifiedBillingAliases(db,google);
  await saveVerifiedBillingAliases(db,kakao);
  assert.equal(aliases.get(USER_KAKAO), 'person:'+PERSON);
  assert.equal(await recurringBillingCollision(db,{
    subject_type:'person',subject_key:USER_GOOGLE,site:'marketing'
  }),true);
  assert.equal(await recurringBillingCollision(db,{
    subject_type:'tenant',subject_key:'other',site:'marketing'
  }),false);
});
test('an alias cannot be silently reassigned to a second EKODI Person',async()=>{
  const {db}=memoryD1([]);
  const good=parseBillingIdentity(proof,user(USER_GOOGLE));
  await saveVerifiedBillingAliases(db,good);
  const secondPerson='f79b7dca-3d20-4d0e-9abb-4b19ef699c77';
  const malicious=parseBillingIdentity({...proof,person_id:secondPerson},
    user(USER_GOOGLE));
  await assert.rejects(()=>saveVerifiedBillingAliases(db,malicious),
    {code:'BILLING_IDENTITY_ALIAS_CONFLICT'});
});
test('scheduler checks verified duplicate subscriptions before any charge',()=>{
  const billing=read('membership-billing.js');
  const universal=read('universal-membership.js');
  assert.match(billing,/recurringBillingCollision\(env\.DB, row\)/);
  const schedule=billing.slice(billing.indexOf('export async function runMembershipBillingSchedule'));
  assert.ok(schedule.indexOf('recurringBillingCollision(env.DB, row)') <
            schedule.indexOf('await charge(env,'));
  assert.match(billing,/saveVerifiedBillingAliases\(env\.DB, identity\)/);
  assert.match(universal,/saveVerifiedBillingAliases\(env\.DB, identity\)/);
  assert.match(billing,/membership_billing_collision_audit/);
});
