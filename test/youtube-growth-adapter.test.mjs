import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getYoutubeGrowthStatus, handleYoutubeGrowthRequest } from '../youtube-growth-adapter.js';

const source = await readFile(new URL('../youtube-growth-adapter.js', import.meta.url), 'utf8');

test('YouTube adapter keeps OAuth credentials server-side and requests the required scopes', () => {
  assert.match(source, /youtube\.force-ssl/);
  assert.match(source, /youtube\.upload/);
  assert.match(source, /access_type','offline/);
  assert.match(source, /include_granted_scopes','true/);
  assert.match(source, /prompt','consent/);
  assert.match(source, /oauth2\.googleapis\.com\/token/);
});

test('YouTube product comments only accept the canonical EKODI Mall host and path', () => {
  assert.match(source, /url\.hostname !== 'ekodi\.kr'/);
  assert.match(source, /url\.pathname === '\/mall'/);
  assert.match(source, /url\.pathname\.startsWith\('\/mall\/'\)/);
  assert.doesNotMatch(source, /mall\.ekodi\.kr/);
  assert.match(source, /에코디몰에서 보기:/);
});

test('YouTube tokens use encrypted refresh-token vault records', () => {
  assert.match(source, /AES-GCM/);
  assert.match(source, /token_ciphertext/);
  assert.match(source, /credentialType:'refresh_token'/);
  assert.match(source, /refresh_token:refreshToken/);
  assert.doesNotMatch(source, /refresh_token\s+TEXT/i);
});

test('status reports disabled until the platform OAuth app credentials are installed', async () => {
  const disabled = getYoutubeGrowthStatus({PUBLIC_BASE_URL:'https://marketing-connect-api.ekodi.kr'});
  assert.equal(disabled.configured, false);
  assert.equal(disabled.commentPublishing, true);
  assert.equal(disabled.uploadScopePrepared, true);
  assert.equal(disabled.callbackUrl, 'https://marketing-connect-api.ekodi.kr/oauth/youtube/callback');

  const enabled = getYoutubeGrowthStatus({
    PUBLIC_BASE_URL:'https://marketing-connect-api.ekodi.kr',
    GOOGLE_YOUTUBE_CLIENT_ID:'client-id',
    GOOGLE_YOUTUBE_CLIENT_SECRET:'client-secret',
  });
  assert.equal(enabled.configured, true);

  const response = await handleYoutubeGrowthRequest(new Request('https://marketing-connect-api.ekodi.kr/v1/youtube/status'), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.configured, false);
  assert.equal(body.encryptedRefreshTokenVault, true);
});
