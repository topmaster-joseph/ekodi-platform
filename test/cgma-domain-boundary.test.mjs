import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [wrangler, workflow, amendment, manifestText] = await Promise.all([
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8'),
  readFile(new URL('../governance/amendments/2026-09-03-cgma-public-domain-v1.5.2.json', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'),
]);

test('CGMA external DNS stays outside Shared Site ownership until approved cutover', () => {
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?cgma\.or\.kr"/);
  assert.match(amendment, /move cgma\.or\.kr DNS from the legacy provider to the EKODI edge only after DNS authority is available/);
  assert.match(workflow, /'https:\/\/cgma\.or\.kr\/'/);
  assert.match(workflow, /'https:\/\/www\.cgma\.or\.kr\/'/);
});

test('Shared Site domain repair enforces only the canonical apex custom domain', () => {
  assert.doesNotMatch(workflow, /for host in[^\n]*cgma\.or\.kr/);
  assert.match(workflow, /root_host='ekodi\.kr'/);
  assert.match(workflow, /custom_domain_count=.*grep -c 'custom_domain = true'/);
  assert.match(workflow, /Unexpected Shared Site custom domain attachment detected/);
  assert.match(workflow, /Unexpected Shared Site custom domain remains attached after synchronization/);
});

test('Shared Site candidate smoke excludes the independently routed CGMA public gateway', () => {
  const manifest = JSON.parse(manifestText);
  const urls = manifest.worker.requests.map(request => request.url);
  for (const url of [
    'https://ekodi.kr/cgma',
    'https://ekodi.kr/cgma/',
    'https://ekodi.kr/cgma/marketing',
  ]) assert.ok(!urls.includes(url), `independently routed CGMA URL leaked into Shared Site candidate smoke: ${url}`);
});

test('CGMA edge workflow pins board delegation source and verifies independent board', async () => {
  const cgmaWorkflow=await readFile(new URL('../.github/workflows/deploy-cgma-apex-edge.yml',import.meta.url),'utf8');
  assert.match(cgmaWorkflow, /CGMA_SOURCE_REF: 'f97d03f1e290763a2e0cfe7f64b2b92f74d231ef'/);
  assert.match(cgmaWorkflow, /grep -Fq 'isBoardPath' cgma-root-gateway\.js/);
  assert.match(cgmaWorkflow, /grep -Fq 'delegatedBoardResponse' cgma-root-gateway\.js/);
  assert.match(cgmaWorkflow, /check_board '\/cgma\/board'/);
  assert.match(cgmaWorkflow, /x-ekodi-board-independent: true/);
  assert.match(cgmaWorkflow, /x-ekodi-board-id: site:cgma:main/);
});


test('CGMA production verifier accepts authenticated protection for admin assets without weakening the route', async () => {
  const cgmaWorkflow=await readFile(new URL('../.github/workflows/deploy-cgma-apex-edge.yml',import.meta.url),'utf8');
  assert.match(cgmaWorkflow, /check_protected_asset\(\)/);
  assert.match(cgmaWorkflow, /--max-redirs 0/);
  assert.match(cgmaWorkflow, /\^30\[12378\]\$/);
  assert.match(cgmaWorkflow, /location.*\/auth\//s);
  assert.match(cgmaWorkflow, /check_protected_asset '\/cgma\/admin\/assets\/cgma-member-admin\.js'/);
  assert.match(cgmaWorkflow, /check_protected_asset '\/cgma\/admin\/assets\/cgma-member-admin\.css'/);
});


test('CGMA protected asset verifier accepts the Workspace Admin auth shell without exposing the asset', async () => {
  const cgmaWorkflow=await readFile(new URL('../.github/workflows/deploy-cgma-apex-edge.yml',import.meta.url),'utf8');
  assert.match(cgmaWorkflow, /grep -Fq '관리자 인증' \/tmp\/cgma\.protected\.body/);
  assert.match(cgmaWorkflow, /x-ekodi-route: workspace-admin/);
  assert.match(cgmaWorkflow, /correctly returned the authenticated Workspace Admin boundary/);
});
