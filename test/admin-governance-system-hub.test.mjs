import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mission = await readFile(new URL('../mission-control-admin.js', import.meta.url), 'utf8');
const timeline = await readFile(new URL('../system-timeline-admin.js', import.meta.url), 'utf8');
const timelineCss = await readFile(new URL('../system-timeline-admin.css', import.meta.url), 'utf8');

test('human-facing admin navigation is reduced to five governance concepts', () => {
  for (const label of ['Overview','Decisions','Ecosystem','AI Council','System']) {
    assert.match(mission, new RegExp(`label:'${label.replace('AI Council','AI Council')}'`));
  }
  assert.match(mission, /governance-command-bar/);
  assert.match(mission, /Chief AI/);
});

test('System hub preserves existing operations instead of deleting them', () => {
  for (const key of ['operations','deployments','timeline','finance','communication','workspace','organization','domains','activity','emergency']) {
    assert.match(timeline, new RegExp(`key:'${key}'`));
  }
  assert.match(timeline, /section:'campus', fallback:'overview'/);
  assert.match(timeline, /#system\/\$\{tool\.key\}/);
  assert.match(timeline, /raw === 'campus'/);
});

test('root and unknown routes resolve to Overview while System owns legacy technical detail', () => {
  assert.match(timeline, /history\.replaceState\(null, '', '#overview'\)/);
  assert.match(timeline, /raw === 'system'/);
  assert.match(timeline, /governanceSystemHub/);
  assert.match(timelineCss, /\.governance-cockpit-admin \.mission-secondary-nav\{display:none!important\}/);
  assert.match(timelineCss, /\.governance-system-grid/);
});
