import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('citizen compose validates an existing session before opening Google account picker',async()=>{
  const source=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
  const start=source.indexOf('(async()=>{const composeRequested=composeIntentRequested();');
  assert.ok(start>=0,'citizen compose initialization exists');
  const end=source.indexOf(')()})();',start);
  assert.ok(end>start,'citizen compose initialization is bounded');
  const initialization=source.slice(start,end);
  const picker=initialization.indexOf('voiceLogin();return');
  const check=initialization.indexOf('alreadySignedIn=await verifyVoiceAccount()');
  assert.ok(check>=0&&picker>check,'verify the board session before any account-picker redirect');
  assert.match(initialization,/if\(!alreadySignedIn\)\{voiceLogin\(\);return\}/);
  assert.match(initialization,/cleaned\.searchParams\.delete\("choose_account"\)/);
  assert.match(initialization,/if\(composeRequested&&allowed\)\{write\.hidden=false/);
});
