import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedDesignProfile } from '../design-profile-runtime.js';

test('adaptive design recommendations stay inside approved profile choices',()=>{
  const church=recommendedDesignProfile('church');
  assert.deepEqual(church,{mode:'recommended',tone:'warm',character:'welcome',season:'auto',motion:'gentle',footer:'contextual'});
  const invest=recommendedDesignProfile('invest');
  assert.equal(invest.character,'off');
  assert.equal(invest.season,'off');
});

test('unknown services fall back to common-engine-safe choices',()=>{
  const profile=recommendedDesignProfile('new-service');
  assert.equal(profile.mode,'recommended');
  assert.equal(profile.tone,'inherit');
  assert.equal(profile.character,'auto');
  assert.equal(profile.footer,'contextual');
});
