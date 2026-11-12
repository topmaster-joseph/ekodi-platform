import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261108200000_bbqcg_verified_public_store_facts.sql');
const workflow=read('.github/workflows/deploy-space.yml');

test('BBQCG verified public facts update exactly the existing customer store',()=>{
  for(const marker of [
    "t.slug='bbqcg'","t.name='BBQ 무안청계점'","t.settings->>'ownership'='customer'",
    "s.operating_space_slug='bbqcg'","s.slug='bbq-muan-cheonggye'",
    "public_address=v_address","public_phone=v_phone","business_hours=v_hours",
    "대표자 박은희","061-453-8295","승달산길 37-1"
  ])assert.ok(sql.includes(marker),marker);
  assert.match(sql,/for update of s/i);
  assert.match(sql,/raise exception/i);
  assert.match(sql,/begin;/i);
  assert.match(sql,/commit;/i);
  assert.doesNotMatch(sql,/\b(insert|delete|truncate)\b/i);
  assert.doesNotMatch(sql,/\b(is_published|order_enabled)\s*=/i);
  assert.doesNotMatch(sql,/\b(tenant_members|store_members|auth\.users)\b/i);
});
test('BBQCG public facts are pinned and applied through the protected DEV-first release',()=>{
  assert.ok(workflow.includes('BBQ_FACTS_MIGRATION: supabase/migrations/20261108200000_bbqcg_verified_public_store_facts.sql'));
  assert.ok(workflow.includes('BBQ_FACTS_PINNED_BLOB: 9aa29f1bf45cd411b4fa09a12cab3eb93ef769d1'));
  assert.ok(workflow.includes('test "$(git hash-object "$BBQ_FACTS_MIGRATION")" = "$BBQ_FACTS_PINNED_BLOB"'));
  assert.ok(workflow.includes('for project in "$BBQ_DEV_PROJECT" "$SUPABASE_PROJECT_REF"; do'));
  assert.ok(workflow.includes('read_only:true'));
  assert.ok(workflow.includes('scoped_customer'));
  assert.ok(workflow.includes('no_checkout'));
  assert.ok(workflow.includes('facts_ready'));
  assert.ok(workflow.includes("if: github.event_name != 'pull_request'"));
});
