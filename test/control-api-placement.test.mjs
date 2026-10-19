import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const wrangler=readFileSync(new URL('../wrangler.api.toml',import.meta.url),'utf8');

test('Control API runs in an Anthropic-supported region, not wherever the edge lands',()=>{
  const block=wrangler.match(/^\[placement\]\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
  assert.ok(block,'[placement] block missing');
  assert.match(block[1],/^region = "aws:ap-northeast-2"$/m);
  assert.doesNotMatch(block[1],/^(mode|host|hostname) =/m,'placement options are mutually exclusive');
});
