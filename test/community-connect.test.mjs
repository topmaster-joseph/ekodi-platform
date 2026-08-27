import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../community/connect/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../community/connect/app.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../supabase/functions/connect-api/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260826223000_community_connect_trusted_matching.sql', import.meta.url), 'utf8');
const adultMigration = await readFile(new URL('../supabase/migrations/20260826223200_community_connect_match_upsert_and_adult_gate.sql', import.meta.url), 'utf8');

test('Connect is consent-first and marriage is explicit adult opt-in', () => {
  assert.match(page, /name="discoverable"/);
  assert.match(page, /name="marriage_enabled"/);
  assert.match(page, /name="age_19_confirmed"/);
  assert.match(page, /name="consent"/);
  assert.match(api, /consent_required/);
  assert.match(api, /adult_confirmation_required/);
  assert.match(adultMigration, /community_connect_marriage_requires_adult/);
});

test('Connect never reveals contact details in v1 match payloads', () => {
  assert.match(page, /연락처는 상호 관심 뒤에도 자동 공개하지 않습니다/);
  assert.match(api, /contact_revealed\s*:\s*false/);
  const start = api.search(/path\s*===\s*"\/recommendations"/);
  const end = api.search(/path\s*===\s*"\/interest"/);
  assert.ok(start >= 0 && end > start, 'recommendation route must be identifiable');
  const recommendationBlock = api.slice(start, end);
  assert.doesNotMatch(recommendationBlock, /session\.user\.email|\bemail\s*:/);
});

test('Connect provides block and report safety controls', () => {
  assert.match(api, /path\s*===\s*"\/block"/);
  assert.match(api, /path\s*===\s*"\/report"/);
  assert.match(app, /openReport/);
  assert.match(migration, /community_connect_blocks/);
  assert.match(migration, /community_connect_reports/);
});

test('relationship tables are server-only in v1', () => {
  for (const table of ['community_connect_profiles','community_connect_actions','community_connect_matches','community_connect_blocks','community_connect_reports']) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
});

test('matching core is deterministic and does not call a model provider', () => {
  assert.match(api, /deterministic-consent-first/);
  assert.doesNotMatch(api, /api\.openai\.com|generativelanguage|anthropic\.com/);
});
