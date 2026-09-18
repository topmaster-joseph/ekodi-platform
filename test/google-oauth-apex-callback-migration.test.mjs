import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

function recorder(body='ok') {
  const calls = [];
  return {
    calls,
    fetch: async request => {
      calls.push(new URL(request.url));
      return new Response(body, { headers:{'content-type':'text/plain'} });
    },
  };
}

test('Google OAuth callback migration keeps legacy active until canonical activation and pins in-flight redirect URIs', async () => {
  const source = await fs.promises.readFile(new URL('../google-drive-storage-control.js', import.meta.url), 'utf8');
  assert.match(source, /const LEGACY_REDIRECT_URI = 'https:\/\/drive\.ekodi\.kr\/api\/control\/storage\/google\/callback';/);
  assert.match(source, /const CANONICAL_REDIRECT_URI = 'https:\/\/ekodi\.kr\/storage\/api\/control\/storage\/google\/callback';/);
  assert.match(source, /const MARKETING_YOUTUBE_CALLBACK = 'https:\/\/ekodi\.kr\/marketing-connect-api\/oauth\/youtube\/callback';/);
  assert.match(source, /GOOGLE_DRIVE_OAUTH_REDIRECT_URI \|\| LEGACY_REDIRECT_URI/);
  assert.match(source, /redirectUri,exp:/);
  assert.match(source, /stateGoogleOAuthRedirectUri\(payload,env\)/);
  assert.match(source, /redirect_uri:redirectUri/);
  assert.match(source, /canonicalRedirectUri:CANONICAL_REDIRECT_URI/);
  assert.match(source, /legacyRedirectUri:LEGACY_REDIRECT_URI/);
});

test('canonical apex edge routes reach Storage and Marketing callback workers with prefixes stripped', async () => {
  const storage = recorder();
  let response = await routeCanonicalSurface(
    new Request('https://ekodi.kr/storage/api/control/storage/google/callback?state=invalid&code=invalid'),
    { STORAGE:storage },
  );
  assert.equal(response.status, 200);
  assert.equal(storage.calls.length, 1);
  assert.equal(storage.calls[0].hostname, 'drive.ekodi.kr');
  assert.equal(storage.calls[0].pathname, '/api/control/storage/google/callback');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'), 'storage');
  assert.equal(response.headers.get('x-ekodi-canonical-path'), '/storage');

  const marketing = recorder();
  response = await routeCanonicalSurface(
    new Request('https://ekodi.kr/marketing-connect-api/oauth/youtube/callback?state=invalid&ticket=invalid'),
    { MARKETING_GROWTH:marketing },
  );
  assert.equal(response.status, 200);
  assert.equal(marketing.calls.length, 1);
  assert.equal(marketing.calls[0].hostname, 'marketing-connect-api.ekodi.kr');
  assert.equal(marketing.calls[0].pathname, '/oauth/youtube/callback');
  assert.equal(response.headers.get('x-ekodi-canonical-surface'), 'marketing-connect-api');
  assert.equal(response.headers.get('x-ekodi-canonical-path'), '/marketing-connect-api');
});
