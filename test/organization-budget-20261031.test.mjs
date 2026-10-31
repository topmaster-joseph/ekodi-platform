import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isOrganizationAdminPath, organizationAdminPage, organizationAdminScript } from '../organization-admin-page.js';

const sql = fs.readFileSync(new URL('../supabase/migrations/20261031210000_organization_budget_lines.sql', import.meta.url), 'utf8');

test('budget section is an admin path for every organization tenant', async () => {
  for (const p of ['/hammu/admin/budget', '/mokpo-presbytery/admin/budget', '/mokpo-presbytery/mission/admin/budget']) assert.equal(isOrganizationAdminPath(p), true, p);
  const html = await organizationAdminPage('/mokpo-presbytery/mission/admin/budget').text();
  assert.match(html, /href="\/mokpo-presbytery\/mission\/admin\/budget">예산</);
  assert.match(html, /<title>예산 · 목포노회 선교부<\/title>/);
});

test('admin login uses the unified EKODI auth hub, not a Google-only prompt', async () => {
  const js = await (await organizationAdminScript()).text();
  assert.match(js, /EKODI 통합로그인/);
  assert.doesNotMatch(js, /Google 계정으로 로그인/);
  assert.doesNotMatch(js, /searchParams\.set\('direct','1'\)/);
  assert.match(js, /organization_budget_snapshot/);
  assert.match(js, /organization_budget_command/);
});

test('budget migration is additive, tenant-guarded, audited and blocks over-target approval', () => {
  assert.doesNotMatch(sql, /^\s*(drop|truncate|delete\s+from\s+public\.(?!organization_budget_lines))/im);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.organization_budget_lines from public, anon, authenticated/);
  assert.equal((sql.match(/organization_can_manage\(v_tenant\)/g) || []).length, 2, 'both RPCs check tenant management');
  assert.match(sql, /revoke all on function public\.organization_budget_snapshot\(text,integer\) from public, anon/);
  assert.match(sql, /revoke all on function public\.organization_budget_command\(text,text,jsonb\) from public, anon/);
  assert.match(sql, /insert into public\.organization_audit_logs/);
  assert.match(sql, /budget_exceeds_target/);
  assert.match(sql, /status = 'draft', approved_by = null/, 'editing a line returns it to draft');
});

test('seeded 2027 mission draft sums exactly to the 3,000,000원 target', () => {
  const seed = sql.slice(sql.indexOf("lines(line_key, label, planned_amount, sort_order) as (values"));
  const amounts = [...seed.matchAll(/'[a-z_]+', '[^']+', (\d+), \d+\)/g)].map(m => Number(m[1]));
  assert.equal(amounts.length, 7);
  assert.equal(amounts.reduce((a, b) => a + b, 0), 3000000);
  assert.match(sql, /jsonb_build_object\('2027', 3000000\)/);
});
