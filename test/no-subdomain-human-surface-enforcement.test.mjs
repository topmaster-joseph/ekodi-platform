import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Invest authentication and admin discovery use only the canonical apex path',async()=>{
  const [auth,admin,policy]=await Promise.all([
    read('auth-site/client-auth.js'),
    read('admin-lazy-features.js'),
    read('governance/amendments/2026-09-27-no-subdomain-human-surface-enforcement-v1.json')
  ]);
  assert.match(auth,/invest:\{name:'EKODI Investment',returnTo:'https:\/\/ekodi\.kr\/invest'/);
  assert.doesNotMatch(auth,/invest:\{[^\n]*invest\.ekodi\.kr/);
  assert.match(admin,/domain:'ekodi\.kr\/invest', name:'에코디 투자'/);
  assert.doesNotMatch(admin,/domain:'invest\.ekodi\.kr', name:'에코디 투자'/);
  const rule=JSON.parse(policy);
  assert.equal(rule.investCanonical,'https://ekodi.kr/invest');
  assert.ok(rule.mandatoryRules.some(value=>value.includes('must not advertise *.ekodi.kr')));
});
