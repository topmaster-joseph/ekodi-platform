import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessBackgroundBrowserReceipt } from '../background-browser-proof.js';

const good = Object.freeze({
  ok:true,
  mode:'background-browser-worker',
  virtualizationProvider:'ekodi-native-remote-computer',
  routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
  browserProcessClosed:true,
  profileRemoved:true,
  temporaryProfileRemoved:true,
  screenshotArtifactRemoved:true,
  authRequired:false,
  dedicatedAutomationProfile:true,
  ephemeralProfile:true,
  offscreenOrHeadless:true,
  focusIsolated:true,
  clipboardShared:false,
  userInputInjection:false,
  activeUserProfileReused:false,
  javascriptEnabled:false,
  mutationMode:'read-only-static-surface',
  httpMethod:'GET',
  contentBytes:24,
  screenshotBytes:900,
  contentSha256:'a'.repeat(64),
  screenshotSha256:'b'.repeat(64),
  browserProcessIdObserved:true,
  ownedTabsObserved:1,
  ownedTabsClosed:1,
  executionMode:'background-only',
  createUserBrowserTab:false,
  ownedAutomationSurfaceAutoClosed:true,
  userOwnedSurfacesPreserved:true,
  interactiveLoginOpened:false,
});

const verify = (proof, opts={}) => assessBackgroundBrowserReceipt({
  requestId:'cmd_safe_123',deviceId:'device_safe_123',result:{browserWorker:proof},...opts,
});

test('accepts a fully isolated, read-only, cleaned native worker receipt', () => {
  assert.deepEqual(verify(good), {
    ok:true,outcome:'verified',code:'BACKGROUND_BROWSER_PROOF_VERIFIED',
  });
});

test('rejects a success flag without an authenticated device-bound native proof', () => {
  assert.equal(assessBackgroundBrowserReceipt({
    requestId:'cmd_safe_123',deviceId:'device_safe_123',result:{message:'done'}
  }).outcome,'invalid');
  assert.equal(verify(good,{deviceId:''}).ok,false);
  assert.equal(verify(good,{requestId:''}).ok,false);
});

test('fails closed on missing, true or contradictory user-surface and cleanup flags', () => {
  const unsafeFields = {
    executionMode:'foreground',
    createUserBrowserTab:true,
    ownedAutomationSurfaceAutoClosed:false,
    userOwnedSurfacesPreserved:false,
    interactiveLoginOpened:true,
    activeUserProfileReused:true,
    focusIsolated:false,
    clipboardShared:true,
    userInputInjection:true,
    dedicatedAutomationProfile:false,
    ephemeralProfile:false,
    offscreenOrHeadless:false,
    profileRemoved:false,
    temporaryProfileRemoved:false,
    screenshotArtifactRemoved:false,
    browserProcessClosed:false,
    ownedTabsClosed:0,
  };
  for (const [field,value] of Object.entries(unsafeFields)) {
    assert.equal(verify({...good,[field]:value}).ok,false,field);
    const missing={...good};
    delete missing[field];
    assert.equal(verify(missing).ok,false,'missing '+field);
  }
});

test('requires actual read-only DOM and screenshot evidence, not a success label', () => {
  for (const [field,value] of Object.entries({
    mode:'desktop',virtualizationProvider:'external-bridge',
    routingPolicy:'unknown',httpMethod:'POST',mutationMode:'write',
    javascriptEnabled:true,contentBytes:0,screenshotBytes:0,
    contentSha256:'invalid',screenshotSha256:'invalid',
    browserProcessIdObserved:false,ownedTabsObserved:0,
    ok:false,
  })) assert.equal(verify({...good,[field]:value}).ok,false,field);
});

test('authentication required is terminal only with isolation and full cleanup proof', () => {
  const auth={...good,ok:false,authRequired:true,code:'AUTH_REQUIRED'};
  assert.deepEqual(verify(auth),{ok:false,outcome:'auth_required',code:'AUTH_REQUIRED'});
  assert.equal(verify({...auth,interactiveLoginOpened:true}).outcome,'invalid');
  assert.equal(verify({...auth,profileRemoved:false}).outcome,'invalid');
  assert.equal(verify({...auth,code:'OTHER'}).outcome,'invalid');
  assert.equal(verify({...good,authRequired:true}).outcome,'invalid');
});

test('both live API completion boundaries enforce the shared receipt before success or retry', async () => {
  const [hybrid,devices] = await Promise.all([
    readFile(new URL('../hybrid-execution.js',import.meta.url),'utf8'),
    readFile(new URL('../device-control.js',import.meta.url),'utf8'),
  ]);
  for(const [name,source] of [['hybrid',hybrid],['devices',devices]]){
    assert.match(source,/import \{ assessBackgroundBrowserReceipt \} from '\.\/background-browser-proof\.js'/,name);
    assert.match(source,/assessBackgroundBrowserReceipt\(\{ result, requestId:commandId, deviceId:device\.id \}\)/,name);
    assert.match(source,/browserProofInvalid/,name);
    assert.match(source,/BACKGROUND_BROWSER_PROOF_INVALID/,name);
    assert.match(source,/!browserProofInvalid/,name);
  }
  assert.match(hybrid,/browserProof\?\.outcome === 'auth_required'/);
  assert.match(devices,/browserAuthRequired/);
  assert.match(devices,/!browserAuthRequired/);
});
