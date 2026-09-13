import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow=fs.readFileSync('.github/workflows/production-gate.yml','utf8');

test('production revenue probes retry transient transport errors without weakening assertions',()=>{
  assert.match(workflow,/--retry 3 --retry-delay 1 --retry-all-errors/);
  assert.match(workflow,/\[ "\$api_code" = '200' \]/);
  assert.match(workflow,/grep -Fq "\$needle" \/tmp\/body/);
});
