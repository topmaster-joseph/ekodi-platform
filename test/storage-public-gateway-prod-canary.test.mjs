import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/deploy-control-api.yml',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../storage-gateway.js',import.meta.url),'utf8');

test('protected production Control release verifies anonymous storage paths live',()=>{
  const block=workflow.split('      - name: Verify anonymous Storage Gateway private routes remain 401 in production\n')[1]
    ?.split('      - name: Verify CGMA e-document signing API boundary without writing records')[0];
  assert.ok(block,'production storage probe step must appear in guarded release');
  for(const route of [
    '/api/storage/v1/policy','/api/storage/v1/files/ekodi-anonymous-canary',
    '/api/storage/v1/file-provenance/ekodi-anonymous-canary'
  ])assert.ok(block.includes(route));
  assert.match(block,/test "\$status" = '401'/);
  assert.match(block,/'"code":"STORAGE_UNAUTHORIZED"'/);
  assert.match(block,/cache-control:\[\[:space:\]\]\*no-store/);
  assert.match(block,/--max-redirs 0/);
  assert.doesNotMatch(block,/Authorization: Bearer|x-ekodi-storage-key|--data-binary|--request POST/);
});
test('canonical public proxy retains strict key check rather than trusting caller Host',()=>{
  assert.match(gateway,/function sharedKeyAuthorized\(request,env\)/);
  assert.match(gateway,/if \(!publicHealth && !sharedKeyAuthorized\(request,env\)\)/);
});
