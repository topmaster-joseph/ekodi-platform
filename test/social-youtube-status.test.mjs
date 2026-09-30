import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanHandle, cleanChannelId, channelFromHtml, publicPageStatus } from '../social-youtube-status.js';

test('YouTube identity validation rejects arbitrary URLs and accepts public identifiers',()=>{
  assert.equal(cleanHandle('@cgma4989'),'cgma4989');
  assert.equal(cleanHandle('https://evil.example/x'),'');
  assert.equal(cleanChannelId('UC001JT9opxVBt9z_h-tsx8A'),'UC001JT9opxVBt9z_h-tsx8A');
  assert.equal(cleanChannelId('not-a-channel'),'');
});

test('public page parser recognizes active live broadcast',()=>{
  const html='{"liveBroadcastDetails":{"isLiveNow":true,"startTimestamp":"2026-09-05T04:56:52+00:00"},"externalVideoId":"anY429C4LKs"}';
  assert.deepEqual(publicPageStatus(html,Date.parse('2026-09-05T07:00:00Z')),{
    state:'live',videoId:'anY429C4LKs',scheduledStartTime:'2026-09-05T04:56:52+00:00',source:'public-page'
  });
});

test('public page parser recognizes a future scheduled broadcast',()=>{
  const html='{"liveBroadcastDetails":{"isLiveNow":false,"startTimestamp":"2026-09-06T02:00:00+00:00"},"externalVideoId":"AbCdEfGhI12"}';
  assert.equal(publicPageStatus(html,Date.parse('2026-09-05T07:00:00Z')).state,'scheduled');
});
test('public page parser falls back to latest stream replay',()=>{
  const html='{"externalId":"UC001JT9opxVBt9z_h-tsx8A","contentId":"3kcSSTK_WbI","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"}';
  const result=publicPageStatus(html,Date.parse('2026-09-05T07:00:00Z'));
  assert.equal(result.state,'ended');
  assert.equal(result.videoId,'3kcSSTK_WbI');
  assert.equal(channelFromHtml(html),'UC001JT9opxVBt9z_h-tsx8A');
});

test('public page parser fails closed when no playable stream exists',()=>{
  assert.deepEqual(publicPageStatus('<html>channel only</html>'),{
    state:'unavailable',videoId:'',scheduledStartTime:'',source:'public-page'
  });
});
