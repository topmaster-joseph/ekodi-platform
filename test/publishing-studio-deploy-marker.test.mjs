import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const studio=await readFile(new URL('../publishing/studio/index.html',import.meta.url),'utf8');
const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/publishing.worker.json',import.meta.url),'utf8'));
const workflow=await readFile(new URL('../.github/workflows/deploy-publishing.yml',import.meta.url),'utf8');

test('publishing studio guarded deployment probes use a marker rendered by the current HTML',()=>{
  const match=studio.match(/<p class="eyebrow">([^<]+)<\/p>/);
  assert.ok(match,'studio eyebrow marker must exist for a real render');
  const marker=match[1];
  assert.ok(marker.trim().length>0);
  const target=manifest.worker.requests.find(item=>new URL(item.url).pathname==='/publishing/studio/');
  assert.ok(target,'guarded candidate must verify the studio path');
  assert.equal(target.statuses.includes(200),true);
  assert.ok(target.expect.includes(marker),'candidate smoke must expect the rendered marker');
  assert.ok(workflow.includes("grep -Fq '"+marker+"' /tmp/studio.html"),'post-deploy verification must use the rendered marker');
  assert.ok(target.headerExpect.includes('x-ekodi-shell: v2'),'shell guard must remain active');
  assert.doesNotMatch(workflow,/grep -Fq 'PUBLISHING STUDIO' \/tmp\/studio\.html/,'retired copy must not block release');
});
