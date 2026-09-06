import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8').replace(/^\uFEFF/,'');

test('EKODIAN identity registry is explicit, privacy-preserving and Generation 8 governed',()=>{
  const source=read('shell/character-identity-registry.js');
  const events=[];
  const sandbox={
    window:{dispatchEvent:event=>events.push(event)},
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail||null;}}
  };
  vm.runInNewContext(source,sandbox,{filename:'character-identity-registry.js'});
  const registry=sandbox.window.EKODICharacterIdentityRegistry;
  assert.equal(registry.contract,'ekodi.ekodian-identity.v1');
  assert.equal(registry.generation,8);
  assert.equal(registry.defaultProfile,'canonical');
  assert.equal(registry.resolve('founder').activation,'explicit_only');
  assert.equal(registry.resolve('founder-pastor').subjectAuthorization,'recorded');
  assert.equal(registry.resolve('personal').activation,'authenticated_explicit');
  assert.equal(registry.resolve('unknown').id,'canonical');
  assert.equal(registry.governance.inferFromEmail,false);
  assert.equal(registry.governance.inferFromLoginProvider,false);
  assert.equal(registry.governance.rawBiometricData,'forbidden');
  assert.equal(registry.governance.faceEmbeddings,'forbidden');
  assert.equal(registry.assetPolicy.noEmbeddedBase64Portraits,true);
  assert.equal(registry.schemaVersion,2);
  assert.equal(registry.resolve('founder').visual.portraitUrl,'https://shell.ekodi.kr/assets/ekodian/founder-face.webp');
  assert.equal(registry.resolve('founder-pastor').visual.portraitUrl,'https://shell.ekodi.kr/assets/ekodian/founder-face.webp');
  assert.equal(registry.assetPolicy.localPersonalPortraitProtocol,'blob:');
  assert.ok(Object.isFrozen(registry));
  assert.equal(events.at(-1)?.type,'ekodi:character-identity-registry-ready');
});

test('user character binds identity only through explicit governed profile references',()=>{
  const source=read('shell/user-character.js');
  assert.match(source,/const VERSION=6/);
  assert.match(source,/IDENTITY_CONTRACT='ekodi\.ekodian-identity\.v1'/);
  assert.match(source,/data-ekodi-character-identity-registry/);
  assert.match(source,/window\.EKODICharacterIdentityRegistry/);
  assert.match(source,/subjectAuthorized===true/);
  assert.ok(source.includes('if(!authorized)return fallback;'));
  assert.match(source,/raw\.startsWith\('data:'\)/);
  assert.match(source,/host==='ekodi\.kr'\|\|host\.endsWith\('\.ekodi\.kr'\)/);
  assert.match(source,/raw\.startsWith\('blob:'\)/);
  assert.match(source,/localOnly===true/);
  assert.match(source,/renderPreview/);
  assert.match(source,/setIdentity/);
  assert.match(source,/ekodi:character-identity-registry-ready/);
  assert.doesNotMatch(source,/infer.*email/i);
});

test('Shell bundles character DNA, identity profile registry and renderer in that order',()=>{
  const worker=read('ekodi-shell-worker.js');
  const character=worker.indexOf('${characterRegistry}');
  const identity=worker.indexOf('${characterIdentity}');
  const renderer=worker.indexOf('${userCharacter}');
  assert.ok(character>-1&&identity>character&&renderer>identity);
  assert.match(worker,/x-ekodi-character-registry/);
  assert.match(worker,/x-ekodi-character-identity/);
  assert.match(worker,/characterIdentityRegistryVersion:2/);
  assert.match(worker,/userCharacterVersion:6/);
});
