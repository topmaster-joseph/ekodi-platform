import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CGMA_YOUTUBE, MODES, normalizeOperation, studioChannelIdentity,
  profileDirectory, requireLocalAuthorization, runOwnedBrowser } from '../scripts/ekodi-owned-youtube-browser.mjs';

const code=fs.readFileSync(new URL('../scripts/ekodi-owned-youtube-browser.mjs',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/native-external-browser-policy.json',import.meta.url),'utf8'));

test('CGMA YouTube identity is restored and pinned',()=>{
  assert.equal(CGMA_YOUTUBE.handle,'@cgma4989');
  assert.equal(CGMA_YOUTUBE.channelId,'UC001JT9opxVBt9z_h-tsx8A');
  assert.equal(CGMA_YOUTUBE.publicUrl,'https://www.youtube.com/@cgma4989/live');
  assert.equal(policy.channel.channelId,CGMA_YOUTUBE.channelId);
  assert.equal(policy.trustBoundary.backgroundWorkerPolicyUnchanged,true);
  assert.equal(policy.mutation.automaticGoLive,false);
});
test('provider command is a bounded allowlist, without arbitrary navigation or scripts',()=>{
  assert.deepEqual(MODES,['public-check','session-verify','login-setup']);
  for(const mode of ['eval','upload','delete','go-live','publish','start-stream',undefined]){
    assert.throws(()=>normalizeOperation({mode}),/browser_operation_not_allowed/);
  }
  assert.throws(()=>normalizeOperation({mode:'public-check',channel:'@cgma'}),/browser_channel_mismatch/);
  assert.throws(()=>normalizeOperation({mode:'public-check',url:'https:\/\/evil.test'}),/browser_arbitrary_target_forbidden/);
  assert.throws(()=>normalizeOperation({mode:'public-check',script:'document.cookie'}),/browser_arbitrary_target_forbidden/);
  assert.throws(()=>normalizeOperation({mode:'session-verify',profilePath:'C:\\Users\\Public'}),/browser_arbitrary_target_forbidden/);
  assert.throws(()=>normalizeOperation({mode:'login-setup'}),/browser_setup_explicit_consent_required/);
  assert.equal(normalizeOperation({mode:'public-check'}).readOnly,true);
  assert.equal(normalizeOperation({mode:'session-verify'}).readOnly,true);
});
test('Studio channel is verified by exact ID and only trusted origins',()=>{
  assert.equal(studioChannelIdentity('https://studio.youtube.com/channel/UC001JT9opxVBt9z_h-tsx8A/videos').matched,true);
  assert.equal(studioChannelIdentity('https://studio.youtube.com/channel/UCnp_LXmJBcJRX7CgJT9FF7w').matched,false);
  assert.equal(studioChannelIdentity('https://studio.youtube.com.evil.test/channel/UC001JT9opxVBt9z_h-tsx8A').trusted,false);
  assert.equal(studioChannelIdentity('https://accounts.google.com/signin').requiresLogin,true);
  assert.equal(studioChannelIdentity('http://studio.youtube.com/channel/UC001JT9opxVBt9z_h-tsx8A').trusted,false);
  assert.equal(studioChannelIdentity('https://attacker@studio.youtube.com/channel/UC001JT9opxVBt9z_h-tsx8A').trusted,false);
});
test('profile is operator device dedicated, not an active shared Chrome profile',()=>{
  const profile=profileDirectory({LOCALAPPDATA:'C:\\EKODI-SAFE'},'/home/test');
  assert.match(profile,/BrowserOperator/);
  assert.match(profile,/youtube-cgma4989/);
  assert.equal(policy.trustBoundary.activeUserChromeProfileForbidden,true);
  assert.equal(policy.trustBoundary.credentialCookieOrTokenExportForbidden,true);
  assert.doesNotMatch(code,/storageState\s*\(|document\.cookie|send.*cookie|capture.*password/i);
  assert.match(code,/launchPersistentContext/);
  assert.match(code,/acceptDownloads:false/);
  assert.match(code,/browser_interactive_terminal_required/);
});
test('authenticated mode rejects unapproved session before launching browser',async()=>{
  const folder='/tmp/ekodi-no-consent-'+process.pid;
  await assert.rejects(requireLocalAuthorization(folder),/browser_local_login_setup_required/);
  const chromium={launchPersistentContext:()=>{throw Error('must-not-launch');}};
  await assert.rejects(runOwnedBrowser({mode:'session-verify'},{chromium,env:{LOCALAPPDATA:folder}}),/browser_local_login_setup_required/);
});
test('public mode probes known channel without any local profile',async()=>{
  let requested='',launched=0,closed=0;
  const page={
    route:async()=>{},
    goto:async url=>{requested=url;return {status:()=>200};},
    url:()=>CGMA_YOUTUBE.publicUrl,
  };
  const context={newPage:async()=>page,close:async()=>{closed++;}};
  const browser={newContext:async()=>context,close:async()=>{closed++;}};
  const chromium={launch:async config=>{assert.equal(config.headless,true);launched++;return browser;}};
  const result=await runOwnedBrowser({mode:'public-check'},{chromium});
  assert.equal(requested,CGMA_YOUTUBE.publicUrl);
  assert.equal(result.ok,true);
  assert.equal(result.authenticated,false);
  assert.equal(result.streamingStatus,'unverified');
  assert.equal(launched,1);assert.equal(closed,2);
});
