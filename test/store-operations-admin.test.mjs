import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'store-operations-admin.js');
const registryPath = path.join(root, 'admin-menu-registry.js');

async function text(file) { return readFile(file, 'utf8'); }

test('tri-store operations console stays registered in central admin', async () => {
  const registry = await text(registryPath);
  assert.match(registry, /id:\s*'store-operations'/);
  assert.match(registry, /3매장 통합운영/);
  assert.match(registry, /import\('\.\/store-operations-admin\.js'\)/);
});

test('tri-store console is syntax valid and binds all three canonical workspaces', async () => {
  const result = spawnSync(process.execPath, ['--check', adminPath], { encoding:'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const source = await text(adminPath);
  for (const domain of ['jadam.ai.ekodi.kr','pizzamaru.ai.ekodi.kr','yogurt.ai.ekodi.kr']) assert.match(source, new RegExp(domain.replaceAll('.', '\\.')));
});

test('tri-store console uses real EKODI contracts and does not fake provider write-back', async () => {
  const source = await text(adminPath);
  assert.match(source, /\/api\/marketing\/admin\/overview/);
  assert.match(source, /\/api\/marketing\/ledger\/overview/);
  assert.match(source, /\/api\/marketing\/connectors\/status/);
  assert.match(source, /\/api\/marketing\/connectors\/supabase-orders\/sync/);
  assert.match(source, /externalWriteBack=false/);
  assert.match(source, /외부 쓰기 잠금/);
});

test('original store admin information architecture is mirrored', async () => {
  const source = await text(adminPath);
  for (const label of ['운영 홈','사용자 사이트','주문 · 채널','메뉴 · 가격','매출','재고','고객','리뷰','Marketing AI','매장업무','연결관리','비용 · 정산']) assert.ok(source.includes(label), `missing ${label}`);
});
