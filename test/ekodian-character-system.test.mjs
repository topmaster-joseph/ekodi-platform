import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const registrySource=fs.readFileSync(new URL('../shell/character-registry.js',import.meta.url),'utf8');
const rendererSource=fs.readFileSync(new URL('../shell/user-character.js',import.meta.url),'utf8');
const constitution=fs.readFileSync(new URL('../docs/EKODIAN-CHARACTER-CONSTITUTION.md',import.meta.url),'utf8');

test('EKODIAN registry exposes constitutional identity and service profiles',()=>{
  const events=[];
  const window={dispatchEvent:event=>events.push(event)};
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
  vm.runInNewContext(registrySource,{window,CustomEvent,Object});
  const registry=window.EKODICharacterRegistry;
  assert.equal(registry.system.name,'EKODIAN');
  assert.equal(registry.system.nameKo,'에코디언');
  assert.match(registry.system.role,/디지털 이웃/);
  assert.equal(registry.values.jubilee.intent,'restore');
  assert.equal(registry.placements.error_recovery,'error');
  assert.ok(registry.restraint.minimize.includes('security'));
  assert.ok(registry.services.church);
  assert.ok(registry.services.biz);
  assert.ok(registry.services.mall);
  assert.ok(registry.services.cgma);
  assert.ok(registry.services.jadam);
  assert.ok(registry.services.pizzamaru);
  assert.ok(Object.isFrozen(registry));
  assert.equal(events.at(-1)?.type,'ekodi:character-registry-ready');
});

test('EKODIAN renderer remains parseable and registry-aware',()=>{
  assert.doesNotThrow(()=>new vm.Script(rendererSource));
  assert.match(rendererSource,/character-registry\.js/);
  assert.match(rendererSource,/prefers-reduced-motion/);
  assert.match(rendererSource,/payment/);
  assert.match(rendererSource,/complex_admin/);
});

test('EKODIAN constitution governs registry and renderer',()=>{
  assert.match(constitution,/Guide, never protagonist/);
  assert.match(constitution,/One identity, many expressions/);
  assert.match(constitution,/Constitution → Registry → Renderer → Service surface/);
  assert.match(constitution,/payment and checkout confirmation/i);
  assert.match(constitution,/personal-data review/i);
  assert.match(constitution,/authentication and security/i);
});
