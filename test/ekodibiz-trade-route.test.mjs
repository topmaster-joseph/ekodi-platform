import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('canonical EKODIBIZ trade workspace is routed through shared-site worker', async () => {
  const wrangler = await fs.promises.readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
  assert.ok(wrangler.includes('"/ekodibiz*"'));
  assert.match(
    wrangler,
    /pattern = "ekodi\.kr\/ekodibiz\/trade\*"[\s\S]*zone_name = "ekodi\.kr"/
  );
});
