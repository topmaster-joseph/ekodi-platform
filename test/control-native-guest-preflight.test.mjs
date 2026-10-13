import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyControlNativeGuestPreflight as classify} from '../scripts/classify-control-native-guest-preflight.mjs';

const origin='https://ekodi.kr';
function receipt({
  legacyPath='/control',
  adminControlText='EKODI Admin',
  legacyText='EKODI Control · 무엇을 수행할까요',
}={}){
  const snapshot=(url,text)=>({
    type:'snapshot',url:origin+url,title:text,bodyText:text,
    horizontalOverflow:false,
  });
  return {
    ok:true,mode:'ekodi-owned-background-browser',
    virtualizationProvider:'ekodi-background-browser-worker',
    canonicalOrigin:origin,headless:true,ephemeralContext:true,
    activeUserProfileReused:false,hostInputInjection:false,allowMutation:false,
    blockedMutations:[],pageErrors:[],taskId:'gha-safe',deviceProfile:'desktop',
    results:[
      {type:'initial-goto',url:origin+'/admin/'},
      snapshot('/admin/','EKODI Admin'),
      {type:'goto',url:origin+'/admin/control'},
      snapshot('/admin/control',adminControlText),
      {type:'goto',url:origin+legacyPath},
      snapshot(legacyPath,legacyText),
    ],
  };
}
test('native Chromium evidence identifies the currently deployed standalone Control as not released',()=>{
  const result=classify(receipt());
  assert.equal(result.ok,true);
  assert.equal(result.state,'LEGACY_ROUTES_OBSERVED');
  assert.equal(result.productionReleaseVerified,false);
  assert.equal(result.authenticatedAdminVerified,false);
  assert.equal(result.guestOnly,true);
  assert.equal(result.surfaces[1].controlContentVisible,false);
});
test('canonical guest routes are never mislabeled as signed-in release proof',()=>{
  const result=classify(receipt({
    legacyPath:'/admin/control',
    adminControlText:'EKODI Control 무엇을 수행할까요',
  }));
  assert.equal(result.ok,true);
  assert.equal(result.state,'GUEST_ROUTES_APPEAR_CONSISTENT');
  assert.equal(result.productionReleaseVerified,false);
  assert.equal(result.authenticatedAdminVerified,false);
});
test('unexpected landing page is a review requirement, not a successful deployment',()=>{
  const result=classify(receipt({legacyText:'Welcome to unexpected page'}));
  assert.equal(result.state,'ROUTES_REQUIRE_REVIEW');
  assert.equal(result.productionReleaseVerified,false);
});
test('native isolation, read-only mode and origin protections fail closed',()=>{
  for(const edit of [
    r=>{r.allowMutation=true},
    r=>{r.activeUserProfileReused=true},
    r=>{r.headless=false},
    r=>{r.canonicalOrigin='https://other.example'},
    r=>{r.pageErrors=[{message:'unexpected'}]},
    r=>{r.results[1].url='https://evil.example/admin/'},
    r=>{r.results[1].horizontalOverflow=true},
    r=>{r.results.pop()},
  ]){
    const r=receipt();edit(r);
    assert.equal(classify(r).state,'INVALID_EVIDENCE');
  }
});
test('both responsive device receipts classify without relying on account credentials',()=>{
  for(const device of ['desktop','mobile-portrait']){
    const r=receipt();r.deviceProfile=device;
    const a=classify(r);
    assert.equal(a.ok,true);
    assert.equal(a.deviceProfile,device);
    assert.equal(JSON.stringify(a).includes('Bearer '),false);
  }
});

test('blocked mutations prove non-idempotent requests were prevented without invalidating guest reads',()=>{
  const r=receipt();
  r.blockedMutations=[{method:'POST',resourceType:'fetch'}];
  const a=classify(r);
  assert.equal(a.ok,true);
  assert.equal(a.state,'LEGACY_ROUTES_OBSERVED');
  assert.equal(a.productionReleaseVerified,false);
});
