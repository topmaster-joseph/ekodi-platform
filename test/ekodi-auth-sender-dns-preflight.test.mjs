import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateAuthSenderDns} from '../scripts/verify-ekodi-auth-sender-dns.mjs';

const good={
  senderDomain:'ekodi.kr',
  spfHost:'send.ekodi.kr',
  dkimHost:'selector._domainkey.ekodi.kr',
  spfTxt:['v=spf1 include:mail.provider.example ~all'],
  dmarcTxt:['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.invalid'],
  dkimTxt:['v=DKIM1; k=rsa; p=publickeyexample'],
  dkimCname:[]
};

test('Sender DNS preflight recognizes provider-assigned sender domain records but NEVER claims SMTP activated',()=>{
  const r=evaluateAuthSenderDns(good);
  assert.equal(r.senderDomain,'ekodi.kr');
  assert.equal(r.spfHost,'send.ekodi.kr');
  assert.equal(r.dmarcHost,'_dmarc.ekodi.kr');
  assert.equal(r.dnsPrerequisitesPassed,true);
  assert.equal(r.smtpCredentialsVerified,false);
  assert.equal(r.hostedSupabaseTemplatesVerified,false);
  assert.equal(r.actualExternalOtpDeliveryVerified,false);
  assert.equal(r.releaseEligible,false);
});
test('DKIM CNAME alternative counts as published, still not verified as authorized sender',()=>{
  const r=evaluateAuthSenderDns({...good,dkimTxt:[],dkimCname:['domainkey.provider.example.']});
  assert.equal(r.checks.dkimPublished,true);
  assert.equal(r.releaseEligible,false);
});
test('DNS cannot pass with no provider DKIM host, duplicate SPF or weak malformed DMARC',()=>{
  assert.equal(evaluateAuthSenderDns({...good,dkimHost:'',dkimTxt:[]}).dnsPrerequisitesPassed,false);
  assert.equal(evaluateAuthSenderDns({...good,spfTxt:[good.spfTxt[0],good.spfTxt[0]]}).checks.spfRecord,false);
  assert.equal(evaluateAuthSenderDns({...good,dmarcTxt:['v=DMARC1; rua=mailto:x@example.invalid']}).checks.dmarcRecord,false);
});
test('checks neither send mail nor request credentials or enable feature flags',()=>{
  const src=readFileSync(new URL('../scripts/verify-ekodi-auth-sender-dns.mjs',import.meta.url),'utf8');
  assert.match(src,/resolveTxt,resolveCname/);
  assert.doesNotMatch(src,/createClient|auth\.signUp|fetch\(|SMTP_PASS|PASSWORD|setSecret|updateUser\(/);
  assert.match(src,/releaseEligible:false/);
  assert.match(src,/EKODI_AUTH_DKIM_HOST/);
});
