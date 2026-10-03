import test from 'node:test';
import assert from 'node:assert/strict';
import { TURNSTILE_WIDGET, validateTurnstileWidget } from '../scripts/provision-cloudflare-turnstile.mjs';

test('Turnstile widget contract uses managed interaction-safe host scope',()=>{
  assert.deepEqual(validateTurnstileWidget(),[]);
  assert.equal(TURNSTILE_WIDGET.mode,'managed');
  assert.equal(TURNSTILE_WIDGET.clearance_level,'no_clearance');
  assert.ok(TURNSTILE_WIDGET.domains.includes('ekodi.kr'));
  assert.ok(TURNSTILE_WIDGET.domains.includes('seonammedi.kr'));
  assert.ok(TURNSTILE_WIDGET.domains.includes('xn--3e0b8b58jw4co4mnpll3k.kr'));
  assert.ok(TURNSTILE_WIDGET.domains.length<=10);
});

test('Turnstile provisioning contract rejects global or pre-clearance drift',()=>{
  assert.ok(validateTurnstileWidget({...TURNSTILE_WIDGET,mode:'invisible'}).length>0);
  assert.ok(validateTurnstileWidget({...TURNSTILE_WIDGET,clearance_level:'managed'}).length>0);
  assert.ok(validateTurnstileWidget({...TURNSTILE_WIDGET,domains:['example.com']}).length>0);
});
