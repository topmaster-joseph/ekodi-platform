import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const live = fs.readFileSync(new URL('../live/live.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../live/index.html', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');

test('existing live studio inherits EKODI System Verified broadcast contract', () => {
  assert.match(live, /getUserMedia/);
  assert.match(live, /getDisplayMedia/);
  assert.match(live, /canvas\.captureStream/);
  assert.match(live, /new MediaStream/);
  assert.match(live, /RTCPeerConnection/);
  assert.match(live, /drawContained/);
  assert.match(live, /drawCovered/);
  assert.match(live, /SHARE_MODES/);
  assert.match(live, /displaySurface/);
  assert.match(html, /presentationFileInput/);
  assert.match(html, /data-share-mode="screen"/);
  assert.match(html, /data-share-mode="window"/);
  assert.match(html, /data-share-mode="tab"/);
});

test('mobile portrait source has an explicit full-field-of-view preservation path', () => {
  assert.match(
    live,
    /matchMedia\('\(max-width: 640px\)'\)\.matches\)\{drawContained\(ctx,video,x,y,w,h\);return\}/
  );
});

test('release gate cannot omit broadcast system verification', () => {
  assert.match(workflow, /Broadcast System Verification Contract/);
  assert.match(workflow, /church-live-system-verification\.test\.mjs/);
});
