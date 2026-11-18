import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/ekodi-native-devotion-guest.yml', import.meta.url), 'utf8');

test('first-party devotional screenshots explicitly provision Korean sans and serif glyphs', () => {
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /apt-get install -y --no-install-recommends fonts-noto-cjk/);
  assert.match(workflow, /fc-cache -f/);
  assert.match(workflow, /fc-match -f '[^']+' 'Noto Sans CJK KR:lang=ko'/);
  assert.match(workflow, /fc-match -f '[^']+' 'Noto Serif CJK KR:lang=ko'/);
  assert.ok(
    workflow.indexOf('Install first-party Ubuntu Korean glyph coverage') <
      workflow.indexOf('Verify real public future-date lockdown'),
    'Korean fonts must be installed before any screenshot captures',
  );
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /node scripts\/verify-devotion-guest-native-browser\.mjs/);
});
