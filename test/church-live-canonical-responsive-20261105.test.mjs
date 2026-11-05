import test from 'node:test';
import assert from 'node:assert/strict';
import { churchLiveCss } from '../tenant-live-church-shell.js';

const response=churchLiveCss();
const css=await response.text();

test('church-only canonical LIVE responsive stylesheet is served as CSS',()=>{
  assert.match(response.headers.get('content-type')||'',/text\/css/);
  assert.match(css,/body\[data-tenant="ekodichurch"\] #studioView/);
  assert.match(css,/\.live-shell\{width:min\(1740px,calc\(100% - 32px\)\)/);
  assert.match(css,/@media\(min-width:901px\)/);
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
});

test('studio monitor grows responsively without changing encoded landscape or portrait media',()=>{
  assert.match(css,/#studioView>\.stage:not\(\.portrait\)\{aspect-ratio:16\/10/);
  assert.match(css,/max-height:min\(76dvh,calc\(100dvh - 130px\)\)/);
  assert.doesNotMatch(css,/body\[data-tenant="ekodichurch"\] #viewerView>\.viewer-stage/);
  assert.match(css,/html\[data-church-live-inline=/);
});

test('operator controls remain compact and each pane is word-safe',()=>{
  assert.match(css,/#studioView \.studio-title h2\{font-size:clamp/);
  assert.match(css,/word-break:keep-all/);
  assert.match(css,/#studioView \.studio-tab\{font-size:11px/);
  assert.match(css,/#studioView \.compact-controls button\{font-size:11px/);
});
