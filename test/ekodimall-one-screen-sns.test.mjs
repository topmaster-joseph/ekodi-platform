import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderMallSocialSetup } from '../mall-social-setup.js';
import { workspaceAdminScript, workspaceAdminCss } from '../workspace-admin-page.js';
const src = readFileSync(new URL('../workspace-admin-page.js', import.meta.url), 'utf8');

test('four channel cards distinguish configured OAuth from provider registry', () => {
  const html = renderMallSocialSetup({ platform: { youtubeConfigured: true, metaConfigured: false, threadsConfigured: false } });
  for (const provider of ['facebook','instagram','threads','youtube']) {
    assert.ok(html.includes('data-mall-provider="'+provider+'"'));
  }
  assert.match(html,/data-channel-quick="facebook" disabled/);
  assert.match(html,/data-channel-quick="youtube"/);
  assert.match(html,/mallSocialYoutubeConnectForm/);
  assert.match(html,/type="email"/);
  assert.match(html,/실제 발행 가능 0개/);
  assert.match(html,/플랫폼 설정 필요/);
});

test('registry active is not a substitute for OAuth; autonomous policy is shown as pending', () => {
  const html=renderMallSocialSetup({
    platform: {youtubeConfigured:true,metaConfigured:true,threadsConfigured:true},
    registeredAccounts:[{provider:'facebook',status:'active'}],
    connections:[],
    channels:[{provider:'facebook',status:'active',config:{autoPublishEnabled:true}}],
    policy:{mode:'autonomous'}
  });
  assert.match(html,/OAuth 인증 필요/);
  assert.match(html,/저장된 정책<\/b> 자율 · 실행 대기/);
  assert.match(html,/실제 발행 가능 0개/);
  assert.match(html,/OAuth 연결<\/b> 0개/);
});

test('one connected account and approved publishing channel is counted as publish-ready',()=>{
  const html=renderMallSocialSetup({
    platform:{metaConfigured:true,youtubeConfigured:true},
    connections:[{provider:'facebook',status:'active',external_id:'page1'}],
    channels:[{provider:'facebook',external_account_id:'page1',status:'active',config:{autoPublishEnabled:true}}],
    jobs:[{status:'published'},{status:'queued'}],policy:{mode:'review'},
  });
  assert.match(html,/실제 발행 가능 1개/);
  assert.match(html,/OAuth 연결<\/b> 1개/);
  assert.match(html,/게시 성공 기록<\/b> 1건/);
  assert.match(html,/처리 대기<\/b> 1건/);
  assert.match(html,/mallSocialYoutubeConnectForm/); // YouTube not yet connected
});

test('untrusted values are not interpreted as HTML and no credentials are solicited',()=>{
  const html=renderMallSocialSetup({
    platform:{youtubeConfigured:true},
    policy:{mode:'<script>alert(1)</script>'},
    connections:[{provider:'facebook',status:'active',display_name:'<img src=x onerror=alert(1)>'}],
  });
  assert.doesNotMatch(html,/<script>/i);
  assert.doesNotMatch(html,/<img src=x/i);
  assert.doesNotMatch(html,/name="(?:token|clientSecret|password)"/);
  assert.match(html,/Google 공식 동의 화면/);
});

test('admin client launches account-registration OAuth instead of treating registry active as sufficient',async()=>{
  assert.match(src,/oauthLinkedForAccount/);
  assert.match(src,/if\(alreadyActive&&oauthLinkedForAccount\(alreadyActive\)\)/);
  assert.match(src,/registered\?\.status==='active'&&oauthLinkedForAccount/);
  assert.match(src,/mallSocialYoutubeConnectForm/);
  assert.match(src,/accountEl\.requestSubmit\(\)/);
  assert.match(src,/registeredAccounts:registeredAccounts\.map/);
  assert.match(src,/const GROWTH_API='\/marketing-connect-api'/);
  assert.match(src,/const CHANNEL_AUTOMATION='\/marketing-publish-api'/);
  const script=await workspaceAdminScript().text();
  assert.match(script,/function renderMallSocialSetup/);
  assert.match(script,/mallSocialYoutubeConnectForm/);
  assert.doesNotThrow(()=>new Function(script));
});

test('trial publication uses human approval and does not claim queued publication succeeded',()=>{
  assert.match(src,/id="mallSocialTestForm"/);
  assert.match(src,/window\.confirm\(/);
  assert.match(src,/automationApi\('\/v1\/publish'/);
  assert.match(src,/requestedBy:'human'/);
  assert.match(src,/실제 발행 성공 여부는 아래 최근 게시 작업에서 확인/);
});

test('responsive layout and safe protected release dispatch',async()=>{
  const css=await workspaceAdminCss().text();
  for(const selector of ['.mall-social-providers','.mall-social-test','.mall-social-next','.mall-social-start'])assert.ok(css.includes(selector));
  assert.match(css,/@media\(max-width:700px\)/);
  const orchestrator=readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  for(const file of ['workspace-admin-page.js','mall-social-setup.js'])assert.ok(orchestrator.includes("file==='"+file+"'"));
  assert.match(orchestrator,/deploy-site-core\.yml/);
});
