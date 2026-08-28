import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyMessengerMessage } from '../messenger-triage.js';
import { buildPrincipal, principalCapabilities } from '../ekodi-principal.js';
import { buildChannelEnvelope, normalizeChannel } from '../messenger-channel-adapters.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('workspace migrations keep one Messenger ledger and add asynchronous outbox',async()=>{
  const [base,operator,foundation]=await Promise.all([
    read('migrations/0028_messenger_investment_workspaces.sql'),
    read('migrations/0029_messenger_ai_operator_channels.sql'),
    read('migrations/0030_messenger_event_outbox.sql')
  ]);
  for(const table of ['messenger_threads','messenger_messages','messenger_handoffs','investment_opportunities','investment_diligence_items'])assert.match(base,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for(const table of ['messenger_events','messenger_channel_links'])assert.match(operator,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for(const table of ['messenger_outbox','messenger_identity_audit'])assert.match(foundation,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(foundation,/idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(foundation,/pending','processing','delivered','failed','dead/);
  assert.doesNotMatch(base+operator+foundation,/custody_balance|brokerage_order|securities_order|guaranteed_return/i);
});

test('EKODI principal normalizes identity, workspace role and capabilities',async()=>{
  const principal=buildPrincipal({id:'person:abc',email:'USER@example.com',role:'owner',subjectType:'tenant',subjectKey:'pizzamaru'});
  assert.equal(principal.email,'user@example.com');
  assert.equal(principal.subject.type,'tenant');
  assert.equal(principal.subject.key,'pizzamaru');
  assert.ok(principal.capabilities.includes('conversation:write'));
  assert.ok(principalCapabilities('admin','admin').includes('conversation:operate'));
  const source=await read('ekodi-principal.js');
  assert.match(source,/\/auth\/v1\/user/);
  assert.match(source,/customer_tenants/);
  assert.match(source,/customer_access_grants/);
  assert.match(source,/messenger_identity_audit/);
  assert.match(source,/\.bind\(principal\.id,principal\.kind,principal\.provider,''/);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('deterministic triage remains the first cheap safety layer',()=>{
  const normal=classifyMessengerMessage('이번 주 교회 일정을 알려줘');
  assert.equal(normal.priority,'normal');
  assert.equal(normal.requiresHuman,false);
  const review=classifyMessengerMessage('관리자가 직접 답변해 주세요');
  assert.equal(review.requiresHuman,true);
  assert.ok(review.reasons.includes('explicit_human_request'));
  const urgent=classifyMessengerMessage('결제가 실패했고 환불도 확인해 주세요');
  assert.equal(urgent.priority,'urgent');
  assert.equal(urgent.requiresHuman,true);
});

test('Messenger V2 persists first, then queues assistant work without awaiting provider latency',async()=>{
  const worker=await read('workspace-messenger-v2.js');
  assert.match(worker,/messenger_threads/);
  assert.match(worker,/messenger_messages/);
  assert.match(worker,/messenger_handoffs/);
  assert.match(worker,/enqueueMessengerOutbox/);
  assert.match(worker,/assistant:message:/);
  assert.match(worker,/executionCtx\?\.waitUntil/);
  assert.match(worker,/messageId,assistant/);
  assert.doesNotMatch(worker,/runAiEnhancedTask/);
});

test('outbox owns AI provider calls, rechecks human takeover and uses bounded retry',async()=>{
  const outbox=await read('messenger-outbox.js');
  assert.match(outbox,/runAiEnhancedTask/);
  assert.match(outbox,/MESSENGER_AI_URL/);
  assert.match(outbox,/acceptedHandoff/);
  assert.match(outbox,/before_generation/);
  assert.match(outbox,/before_write/);
  assert.match(outbox,/assistant\.suppressed/);
  assert.match(outbox,/CHANNEL_ADAPTER_NOT_CONFIGURED|dispatchChannelEnvelope/);
  assert.match(outbox,/attempts<8/);
  assert.match(outbox,/status='processing'/);
  assert.match(outbox,/status='delivered'/);
  assert.match(outbox,/dead/);
});

test('provider-neutral channel envelope supports future Kakao and other adapters',()=>{
  assert.equal(normalizeChannel('KAKAO'),'kakao');
  assert.equal(normalizeChannel('unknown'),'');
  const envelope=buildChannelEnvelope({channel:'telegram',threadId:3,messageId:7,body:'hello',externalThreadId:'t-1'});
  assert.equal(envelope.channel,'telegram');
  assert.equal(envelope.threadId,3);
  assert.equal(envelope.messageId,7);
});

test('workspace entrypoint changes only Messenger while preserving legacy Investment worker',async()=>{
  const entry=await read('workspace-platform-entry-worker.js');
  assert.match(entry,/handleWorkspaceMessengerV2/);
  assert.match(entry,/legacyWorkspaceWorker\.fetch/);
  assert.match(entry,/conversationFoundation:'v2'/);
  assert.match(entry,/conversationSchemaReady/);
  assert.match(entry,/drainMessengerOutbox/);
  assert.match(entry,/scheduleOutboxRecovery/);
  const legacy=await read('workspace-platform-api-worker.js');
  assert.match(legacy,/analysis-and-connection-only/);
  assert.match(legacy,/transactionExecution:false/);
  assert.match(legacy,/investment_opportunities/);
  assert.match(legacy,/investment_diligence_items/);
  assert.doesNotMatch(legacy,/executeTrade|placeOrder|custody|guaranteedReturn/);
});

test('Operator uses normalized admin principal, canonical ledger and channel outbox',async()=>{
  const control=await read('messenger-operator-control.js');
  assert.match(control,/principalFromAdminSession/);
  assert.match(control,/conversation:operate/);
  assert.match(control,/messenger_threads/);
  assert.match(control,/messenger_messages/);
  assert.match(control,/messenger_handoffs/);
  assert.match(control,/messenger_events/);
  assert.match(control,/messenger_channel_links/);
  assert.match(control,/enqueueMessengerOutbox/);
  for(const action of ['takeover','reply','release','close','channel-link'])assert.ok(control.includes(action));
  assert.match(control,/HANDOFF_ALREADY_ACCEPTED/);
});

test('workspace configs use V2 entrypoint without consuming another Cloudflare cron slot',async()=>{
  const [staging,bootstrap,production,controlConfig,manifest,controlEntry]=await Promise.all([
    read('wrangler.workspace-platform-staging.toml'),
    read('wrangler.workspace-platform-bootstrap.toml'),
    read('wrangler.workspace-platform.toml'),
    read('wrangler.api.toml'),
    read('deploy/manifests/workspace-platform.worker.json'),
    read('mission-control-entry-worker.js')
  ]);
  for(const config of [staging,bootstrap,production]){
    assert.match(config,/main = "workspace-platform-entry-worker\.js"/);
    assert.match(config,/database_name = "ekodi-auth"/);
  }
  assert.match(staging,/ALLOW_MUTATIONS = "false"/);
  assert.match(bootstrap,/ALLOW_MUTATIONS = "false"/);
  assert.match(production,/ALLOW_MUTATIONS = "true"/);
  assert.doesNotMatch(production,/\[triggers\]/);
  assert.match(controlConfig,/crons = \["\*\/10 \* \* \* \*"\]/);
  assert.match(controlEntry,/drainMessengerOutbox/);
  assert.match(manifest,/conversationFoundation/);
  assert.match(manifest,/conversationSchemaReady/);
});

test('functional Messenger UI understands asynchronous assistant and human takeover',async()=>{
  const router=await read('platform-router-worker.js');
  assert.match(router,/FUNCTIONAL BETA/);
  assert.match(router,/workspace-api\.ekodi\.kr/);
  assert.match(router,/\/auth\/v1\/verify/);
  assert.match(router,/ekodi_token/);
  assert.match(router,/refresh_token/);
  assert.match(router,/authorization:'Bearer '/);
  assert.match(router,/subject_type/);
  assert.match(router,/subject_key/);
  assert.match(router,/newThreadForm/);
  assert.match(router,/newOpportunityForm/);
  assert.match(router,/refreshAssistantUntilSettled/);
  assert.match(router,/EKODI가 답변을 준비하고 있습니다/);
  assert.match(router,/담당자 연결 대기/);
  assert.match(router,/담당자 응답 중/);
  assert.match(router,/EKODI AI/);
});

test('Conversation release is additive, isolated, ordered and guarded',async()=>{
  const [workflow,helper]=await Promise.all([
    read('.github/workflows/release-messenger-investment-functional.yml'),
    read('scripts/apply-d1-migrations-with-retry.sh')
  ]);
  assert.match(workflow,/name: Release EKODI Conversation Foundation/);
  assert.match(workflow,/workspace-staging:\n\s+environment: development\n\s+needs: validate/);
  assert.match(workflow,/control-staging:\n\s+environment: development\n\s+needs: workspace-staging/);
  assert.match(workflow,/production-workspace:/);
  assert.match(workflow,/production-control:\n\s+needs: production-workspace/);
  assert.match(workflow,/production-ui:\n\s+needs: production-control/);
  assert.match(workflow,/ekodi-workspace-staging/);
  assert.match(workflow,/ekodi-conversation-control-staging/);
  assert.match(workflow,/apply-d1-migrations-with-retry\.sh ekodi-auth wrangler\.workspace-platform\.toml/);
  assert.doesNotMatch(workflow,/triggers deploy --config wrangler\.workspace-platform\.toml/);
  assert.match(helper,/d1 migrations apply/);
  assert.match(helper,/UNIQUE constraint failed: d1_migrations\\\.name|d1_migrations\.name/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/workspace-platform\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/control-api\.worker\.json/);
  assert.match(workflow,/guarded-worker-release\.mjs --manifest deploy\/manifests\/shared-site\.worker\.json/);
});
