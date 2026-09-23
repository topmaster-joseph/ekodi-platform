import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const constitutionValidator=read('scripts/validate-constitution.mjs');
const constitution=JSON.parse(read('governance/constitution/constitution.json'));

test('constitution validation intrinsically executes Capability Before Service gate',()=>{
  assert.match(constitutionValidator,/validate-capability-first-service-creation\.mjs/);
  assert.equal(constitution.capabilityFirstServiceCreationPolicy?.newServiceWithoutEvidenceBlocksCi,true);
  assert.equal(constitution.capabilityFirstServiceCreationPolicy?.automaticUserServiceCreationForbidden,true);
});

test('capability CI cannot omit service creation or accumulation gates',()=>{
  assert.match(pkg.scripts['validate:capabilities'],/validate-capability-first-service-creation\.mjs/);
  assert.match(pkg.scripts['validate:capabilities'],/validate-capability-accumulation\.mjs/);
  assert.match(pkg.scripts['validate:capabilities'],/capability-accumulation\.test\.mjs/);
  assert.match(pkg.scripts.check,/validate-capability-first-service-creation\.mjs/);
  assert.match(pkg.scripts.check,/validate-capability-accumulation\.mjs/);
});

test('service gate validator is constitutionally protected',()=>{
  assert.ok(constitution.changeControl?.protectedPaths?.includes('scripts/validate-capability-first-service-creation.mjs'));
});
