import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyOperatorCommand } from './messenger-operator-runtime.js';
import { channelConfigurationStatus, buildChannelEnvelope } from './messenger-channel-adapters.js';
import { handleMessengerOperatorPage } from './messenger-operator-page.js';

test('operator read-only report is observable and typed',()=>{
  const action=classifyOperatorCommand('메신저 운영 현황 보고해');
  assert.equal(action.actionType,'messenger.operations_report');
  assert.equal(action.area,'read_only_audits');
});

test('operator outbox recovery is bounded reversible execution',()=>{
  const action=classifyOperatorCommand('밀린 Outbox 복구해');
  assert.equal(action.actionType,'messenger.outbox_drain');
  assert.equal(action.area,'incident_triage');
  assert.equal(action.reversible,true);
  assert.equal(action.delegated,true);
  assert.equal(action.preflightVerified,true);
});

test('destructive, identity and money commands are never classified as autonomous safe actions',()=>{
  assert.equal(classifyOperatorCommand('사용자 데이터 대량 삭제').area,'destructive_or_mass_data_change');
  assert.equal(classifyOperatorCommand('관리자 권한 변경').area,'identity_merge_or_irreversible_privacy_change');
  assert.equal(classifyOperatorCommand('결제 처리해').area,'high_value_or_exceptional_financial_commitment');
});

test('release request does not claim autonomous deployment authority',()=>{
  const action=classifyOperatorCommand('운영에 바로 배포해');
  assert.equal(action.actionType,'operator.release_request');
  assert.equal(action.delegated,false);
  assert.equal(action.preflightVerified,false);
});

test('channel status reveals modes but never secret values',()=>{
  const env={CHANNEL_TELEGRAM_TOKEN:'secret-telegram',CHANNEL_WHATSAPP_TOKEN:'secret-wa',CHANNEL_WHATSAPP_PHONE_NUMBER_ID:'123',CHANNEL_KAKAO_URL:'https://provider.example/send',CHANNEL_KAKAO_TOKEN:'secret-kakao'};
  const status=channelConfigurationStatus(env);
  assert.equal(status.find(v=>v.channel==='telegram').mode,'telegram_bot_api');
  assert.equal(status.find(v=>v.channel==='whatsapp').mode,'whatsapp_cloud_api');
  assert.equal(status.find(v=>v.channel==='kakao').mode,'kakao_business_provider');
  assert.equal(JSON.stringify(status).includes('secret-'),false);
});

test('channel envelope rejects unknown channels',()=>{
  assert.equal(buildChannelEnvelope({channel:'unknown',threadId:1,body:'hello'}),null);
  assert.equal(buildChannelEnvelope({channel:'telegram',threadId:1,body:'hello'}).channel,'telegram');
});

test('operator page is no-store and only exposed on explicit path',async()=>{
  const response=handleMessengerOperatorPage(new Request('https://api.ekodi.kr/operator'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.match(response.headers.get('content-security-policy'),/accounts\.google\.com/);
  assert.equal(handleMessengerOperatorPage(new Request('https://api.ekodi.kr/other')),null);
});

test('operator Google auth bridge is restricted to exact same origin before reusing admin allowlist',async()=>{
  const source=await readFile(new URL('./mission-control-entry-worker.js',import.meta.url),'utf8');
  assert.match(source,/handleSameOriginOperatorGoogleAuth/);
  assert.match(source,/request\.headers\.get\('origin'\).*url\.origin/);
  assert.match(source,/\['\/api\/google\/challenge','\/api\/google\/login'\]/);
  assert.match(source,/headers\.set\('origin', 'https:\/\/admin\.ekodi\.kr'\)/);
});
