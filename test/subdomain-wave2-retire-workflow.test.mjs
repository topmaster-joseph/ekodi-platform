import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('wave-2 retirement runs only the safe plan, behind the release gate, with a PR dry-run', () => {
  const workflow = read('.github/workflows/retire-public-subdomains-wave2.yml');
  assert.match(workflow, /--config config\/retire-public-subdomains-wave2-safe\.json --dry-run/);
  assert.match(workflow, /validate-ekodi-ai-change-orchestration\.mjs" --release/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /retire-public-subdomains-wave2\.json/);
});
