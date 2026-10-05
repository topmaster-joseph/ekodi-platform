import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../my/user-ai-provider-ui.js', import.meta.url), 'utf8');

test('My EKODI renders first-connection guidance only when backend supplies it', () => {
  assert.match(source, /status\.connectionGuide/);
  assert.match(source, /처음 한 번만/);
  assert.match(source, /connectionGuide\(status\)/);
});

test('personal AI connection management stays collapsed for connected and unconnected users', () => {
  assert.match(source, /<details class="personal-ai-policy"><summary>/);
  assert.match(source, /hasConnected \? 'AI 연결 변경' : 'AI 연결하기'/);
  assert.match(source, /connectedText/);
});

test('provider forms use the generic connection endpoint', () => {
  assert.match(source, /\/connections\/\$\{encodeURIComponent\(providerId\)\}/);
  assert.match(source, /data-provider-key-form/);
  assert.doesNotMatch(source, /data-gemini-key-form/);
});
