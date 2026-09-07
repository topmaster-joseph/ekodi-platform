import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const html=await readFile(new URL('auth-site/oauth-consent.html',root),'utf8');
const js=await readFile(new URL('auth-site/oauth-consent.js',root),'utf8');
const auth=await readFile(new URL('auth-site/auth.js',root),'utf8');
const worker=await readFile(new URL('site-worker.js',root),'utf8');
const build=await readFile(new URL('scripts/build.mjs',root),'utf8');

test('OAuth consent screen is served from the central auth boundary',()=>{
  assert.match(worker,/url\.pathname === '\/oauth\/consent'/);
  assert.match(worker,/assetRequest\(request, '\/oauth-consent'\)/);
  assert.match(build,/auth-site\/oauth-consent\.html/);
  assert.match(build,/oauth-consent\.js/);
  assert.match(html,/PERSONAL AI BRIDGE/);
});

test('OAuth consent uses Supabase OAuth server APIs and preserves login return',()=>{
  assert.match(js,/getAuthorizationDetails\(authorizationId\)/);
  assert.match(js,/approveAuthorization/);
  assert.match(js,/denyAuthorization/);
  assert.match(js,/target\.searchParams\.set\('site','oauth'\)/);
  assert.match(js,/target\.searchParams\.set\('return_to',location\.href\)/);
  assert.match(auth,/oauth:\{name:'EKODI AI 연결'/);
});

const userAi=await readFile(new URL('user-ai-control.js',root),'utf8');
const membership=await readFile(new URL('universal-membership.js',root),'utf8');

test('OAuth client access tokens cannot bypass MCP through normal user APIs',()=>{
  assert.match(userAi,/oauthClientToken\(token\)/);
  assert.match(userAi,/!token \|\| token\.length > 8192 \|\| oauthClientToken\(token\)/);
  assert.match(membership,/oauthClientToken\(token\)/);
  assert.match(membership,/!token \|\| token\.length > 8192 \|\| oauthClientToken\(token\)/);
  assert.match(userAi,/userAiStatusForIdentity/);
  assert.match(membership,/membershipPortfolioForIdentity/);
});
