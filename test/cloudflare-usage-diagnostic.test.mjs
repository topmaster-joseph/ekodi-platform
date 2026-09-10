import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Cloudflare usage diagnostic preserves Worker status breakdowns', async () => {
  const source = await readFile('scripts/diagnose-cloudflare-usage.mjs', 'utf8');
  assert.match(source, /dimensions \{ scriptName status \}/);
  assert.match(source, /statuses:\{\}/);
  assert.match(source, /item\.statuses\[status\]/);
  assert.match(source, /status \$\{statusSummary\}/);
});

test('Cloudflare usage diagnostic remains read-only', async () => {
  const source = await readFile('scripts/diagnose-cloudflare-usage.mjs', 'utf8');
  assert.doesNotMatch(source, /wrangler\s+.*\b(?:deploy|delete)\b/i);
  assert.doesNotMatch(source, /method:\s*['"](?:PUT|PATCH|DELETE)['"]/i);
});
