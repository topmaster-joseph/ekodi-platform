import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMail, isEkodiRelated, parseGmailMessage, shouldNotify } from '../mail-intelligence-core.js';

function b64url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

test('parses Gmail metadata and plain text body', () => {
  const parsed = parseGmailMessage({
    id:'m1', threadId:'t1', internalDate:'1788192000000', snippet:'preview',
    payload:{ mimeType:'text/plain', headers:[
      {name:'From',value:'Cloudflare <noreply@notify.cloudflare.com>'},
      {name:'To',value:'topmaster.joseph@gmail.com'},
      {name:'Subject',value:'ekodibiz.kr alert'},
    ], body:{data:b64url('Production error needs immediate action.')} },
  });
  assert.equal(parsed.gmailId, 'm1');
  assert.match(parsed.body, /Production error/);
});

test('recognizes Ekodi operational mail', () => {
  const mail = { from:'noreply@notify.cloudflare.com',to:'topmaster.joseph@gmail.com',cc:'',subject:'ekodibiz.kr is active',snippet:'',body:'' };
  assert.equal(isEkodiRelated(mail), true);
});

test('suppresses repetitive GitHub success mail', () => {
  const analysis = analyzeMail({
    gmailId:'m2', from:'github-actions[bot] <notifications@github.com>',to:'',cc:'',
    subject:'Re: [topmaster-joseph/ekodi-platform] AI Gateway deployment verification status (Issue #443)',
    snippet:'✅ PRODUCTION VERIFIED commit: abcdef1234567', body:'guarded upstream: success',
  });
  assert.equal(analysis.related, true);
  assert.equal(analysis.suppressed, true);
  assert.equal(shouldNotify(analysis), false);
});

test('alerts on production failure but dedupe signature ignores commit hash', () => {
  const a = analyzeMail({
    gmailId:'m3', from:'github-actions[bot] <notifications@github.com>',to:'',cc:'',
    subject:'Re: [topmaster-joseph/ekodi-platform] Admin deployment verification status (Issue #333)',
    snippet:'❌ PRODUCTION NOT VERIFIED commit: 8aad5917382a42a74451d5e9effa71c917604c73', body:'failed production check',
  });
  const b = analyzeMail({
    gmailId:'m4', from:'github-actions[bot] <notifications@github.com>',to:'',cc:'',
    subject:'Re: [topmaster-joseph/ekodi-platform] Admin deployment verification status (Issue #333)',
    snippet:'❌ PRODUCTION NOT VERIFIED commit: 1c82dea803c8d1445282126fcf37e28cfa9cfca5', body:'failed production check',
  });
  assert.equal(a.suppressed, false);
  assert.equal(shouldNotify(a), true);
  assert.equal(a.dedupeKey, b.dedupeKey);
});

test('business request is action-required', () => {
  const analysis = analyzeMail({
    gmailId:'m5', from:'buyer@example.com',to:'joseph@ekodibiz.kr',cc:'',subject:'Quotation request',
    snippet:'Please confirm price and delivery date.', body:'Please reply with quotation by Friday.',
  });
  assert.equal(analysis.related, true);
  assert.equal(analysis.category, 'business');
  assert.equal(analysis.actionRequired, true);
  assert.equal(shouldNotify(analysis), true);
});
