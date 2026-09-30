import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('EKODI homepage exposes a crawlable SeonamMedi public link', async () => {
  const html=await readFile(new URL('../index.html', import.meta.url),'utf8');
  assert.match(html,/href="https:\/\/ekodi\.kr\/seonammedi\/"[^>]*>서남권 국립의대 소통센터/);
});
