import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
test('guest native audit distinguishes compose return loss from optional purpose mismatch',()=>{
  assert.ok(src.includes('record.composeReturnPathMatches='));
  assert.ok(src.includes('record.composePurposeMatches='));
  assert.ok(src.includes('record.composeReturnMatches='));
  assert.ok(src.includes("'guest_compose_purpose_mismatch'"));
  assert.ok(src.includes("'guest_compose_original_return_lost'"));
  assert.ok(src.includes("u.searchParams.get('return_to')===expectedReturn"));
});
test('guest audit does not log raw OAuth URL or access token',()=>{
  const start=src.indexOf('const composeAuthUrls=');
  const end=src.indexOf('}catch(error){violations.push',start);
  const block=src.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.ok(!block.includes('record.composeAuthUrls='));
  assert.ok(!block.includes('record.loginToken='));
  assert.ok(block.includes('record.composeReturnPathMatches'));
  assert.ok(block.includes('record.composePurposeMatches'));
});
