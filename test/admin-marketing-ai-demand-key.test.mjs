import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('MarketingAI uses one canonical menu and demand feature identity', async () => {
  const [layout, loader] = await Promise.all([
    read('admin-menu-layout.js'),
    read('admin-demand-loader.js'),
  ]);

  assert.match(layout, /\['marketing-ai','marketing-ai'\]/);
  assert.doesNotMatch(layout, /\['marketing-ai','marketing'\]/);
  assert.match(loader, /'marketing-ai':\s*\{/);
  assert.doesNotMatch(loader, /\n\s*marketing:\s*\{/);
  assert.match(loader, /real:\s*'\[data-section="marketing-ai"\]'/);
  assert.match(loader, /hashes:\s*\['#marketing-ai'\]/);
  assert.match(loader, /key === 'marketing' \? 'marketing-ai' : key/);
});

test('MarketingAI placeholder no longer translates a second internal alias', async () => {
  const loader = await read('admin-demand-loader.js');
  assert.match(loader, /button\.dataset\.lazySection = key === 'aimembers' \? 'ai-membership' : key/);
  assert.doesNotMatch(loader, /button\.dataset\.lazySection\s*=\s*key === 'marketing'/);
});