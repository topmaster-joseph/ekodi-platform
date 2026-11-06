import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyChurchCompactHeader } from '../scripts/verify-church-compact-header.mjs';

const root = resolve(import.meta.dirname, '..');
const workflow = readFileSync(join(root, '.github/workflows/deploy-ekodi-church-homepage.yml'), 'utf8');
const nav = [
  ['/ekodichurch/devotion/', '매일묵상'],
  ['/ekodichurch/#worship', '예배·방송'],
  ['/ekodichurch/notices/', '공지사항'],
  ['/ekodichurch/schedule/', '주요일정'],
  ['/ekodichurch/#together', '함께하기'],
  ['/ekodichurch/my/', '마이페이지']
].map(([href, label]) => '<a href="' + href + '">' + label + '</a>').join('');
const html = '<link href="church-compact-navigation.css"><nav id="main-nav">' + nav + '</nav>';

test('canonical six-link validator rejects unreviewed SHA and legacy menu but preserves approved overlay inventory', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ekodi-church-six-nav-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const overlays = [
    [142, '1607bc1c06157c420afabe3bfc62cca9073738c8'],
    [143, '9e8fc072d1d6d66286d9a275fe3960e50e5c5e72'],
    [144, 'b752da0de6520b934b585a1c2a75d8e7af065ac7'],
    [146, 'b79dc3b19b562f9b654bffb55d797ea336c08d34'],
    [149, 'b89c32f9330afbd114dc632306a7b9348c869b7b']
  ].map(([number, headSha]) => ({ number, headSha }));
  const manifest = {
    sourceRepository: 'topmaster-joseph/ekodi-church',
    sourceCommit: '520d4f2daf7e5e4dc53bf928c9df626b5f896600',
    reviewedOverlays: { pullRequests: overlays }
  };
  const manifestFile = join(dir, 'manifest.json');
  const writeManifest = () => writeFileSync(manifestFile, JSON.stringify(manifest));
  for (const p of ['devotion', 'notices', 'schedule']) mkdirSync(join(dir, p));
  for (const p of ['devotion/index.html', 'notices/index.html', 'schedule/index.html']) writeFileSync(join(dir, p), html);
  writeFileSync(join(dir, 'index.html'), html + '<script src="church-section-nav.js"></script><div data-church-notices></div><div data-church-shared-schedules></div>');
  writeFileSync(join(dir, 'church-section-nav.js'), 'hashchange church-section-active');
  writeFileSync(join(dir, 'church-compact-navigation.css'), 'church-section-active min-height:44px');
  writeManifest();
  assert.deepEqual(verifyChurchCompactHeader(dir, manifestFile), {upstreamHead: overlays[4].headSha, pages: 4, links: 6});
  manifest.reviewedOverlays.pullRequests[4].headSha = 'a'.repeat(40);
  writeManifest();
  assert.throws(() => verifyChurchCompactHeader(dir, manifestFile), /exact reviewed PR SHA/);
  manifest.reviewedOverlays.pullRequests[4].headSha = 'b89c32f9330afbd114dc632306a7b9348c869b7b';
  writeManifest();
  writeFileSync(join(dir, 'devotion/index.html'), html.replace('예배·방송', '예배자료'));
  assert.throws(() => verifyChurchCompactHeader(dir, manifestFile), /primary links differ/);
});

test('guarded legacy Cloudflare Pages lane remains separate from canonical SHA-pinned lane', () => {
  assert.match(workflow, /CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED/);
  assert.match(workflow, /EKODI AI Orchestration Gate/);
  assert.match(workflow, /verify-church-compact-header\.mjs/);
  assert.match(workflow, /grep -Fq 'href="#weekly-worship">예배자료<\/a>'/);
  assert.match(workflow, /if: env.CHURCH_RELEASE_SOURCE_MODE == 'canonical'/);
  assert.match(workflow, /ekodi\.church-release\.v2/);
  assert.match(workflow, /--project-name ekodi-church --branch main/);
});
