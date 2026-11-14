import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');

test('first-party Church Chromium proof checks both viewports, without logging in',async()=>{
  const source=await read('scripts/verify-church-native-guest-ui.mjs');
  assert.match(source,/https:\/\/ekodi\.kr/);
  assert.match(source,/width:390,height:844/);
  assert.match(source,/width:1440,height:900/);
  assert.match(source,/\[data-church-worship-admin\]/);
  assert.match(source,/link\.isHidden\(\)/);
  assert.match(source,/serviceWorkers:'block'/);
  assert.match(source,/acceptDownloads:false/);
  assert.match(source,/guest-ui-proof\.json/);
  assert.doesNotMatch(source,/(service_role|sb_secret_|SUPABASE_ACCESS_TOKEN|localStorage\.setItem|sessionStorage\.setItem|login\()/);
});

test('live browser workflow uses own ephemeral runner with no secrets or mutation',async()=>{
  const workflow=await read('.github/workflows/verify-church-native-guest-ui.yml');
  assert.match(workflow,/permissions:\s+contents: read/);
  assert.match(workflow,/node scripts\/verify-church-native-guest-ui\.mjs/);
  assert.match(workflow,/playwright@1\.55\.0/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/secrets\.|environment: production|Desktop.Commander|TinyFish/);
});
