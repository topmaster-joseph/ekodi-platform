import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const verifier=await readFile(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');

test('public guest audit treats Citizen Voices as an auth redirect, not a local Notice tab',()=>{
  const loop=verifier.split('const contexts=[')[1]?.split('const expectedPath=')[0]||'';
  assert.ok(loop,'public navigation test loop must exist');
  assert.match(loop,/활동이력/);
  assert.match(loop,/관련소식/);
  assert.match(loop,/소통채널/);
  assert.match(loop,/조직/);
  assert.doesNotMatch(loop,/시민의견|board\/voices/,'Google login is not a local category');
  assert.match(verifier,/record\.citizenMenuAuthRedirect=true/);
  assert.match(verifier,/url\.origin!==['"]https:\/\/ekodi\.kr['"]/);
  assert.match(verifier,/url\.searchParams\.get\('select_account'\)!=='1'/);
  assert.match(verifier,/back\.pathname===root\.prefix\+'\/board\/voices'/);
  assert.match(verifier,/back\.searchParams\.get\('compose'\)==='1'/);
  assert.match(verifier,/!back\.searchParams\.has\('choose_account'\)/);
  assert.match(verifier,/const afterAuth=await page\.goto\(target/);
});

test('the chromium audit remains read-only and covers desktop/mobile on both mounts',()=>{
  assert.match(verifier,/name:'canonical',origin:'https:\/\/ekodi\.kr'/);
  assert.match(verifier,/name:'customer',origin:'https:\/\/seonammedi\.kr'/);
  assert.match(verifier,/name:'desktop',width:1440/);
  assert.match(verifier,/name:'mobile',width:390/);
  assert.match(verifier,/route\.abort\('blockedbyclient'\)/);
  assert.doesNotMatch(verifier,/google\.accounts\.id\.initialize\(/);
});
