import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('Yuanfeng is registered only as a guarded Mall supplier candidate',async()=>{
  const sql=await read('sites/ekodi-mall/api/migrations/0015_yuanfeng_supplier_candidate.sql');
  assert.ok(sql.includes("'sup_29da090183d19dc2fa35a039151328f4'"));
  assert.ok(sql.includes("'harbin-jixing'"));
  assert.ok(sql.includes("'哈尔滨吉星加热器有限公司'"));
  assert.ok(sql.includes("'contract_supplier'"));
  assert.ok(sql.includes("'candidate'"));
  assert.ok(sql.includes('auto_order_allowed'));
  assert.match(sql,/auto_order_allowed[\s\S]*0/);
  assert.ok(sql.includes('계약/파일럿 전환 금지'));
  assert.ok(!sql.includes("'active'"));
  assert.ok(!sql.includes("'pilot_active'"));
});
