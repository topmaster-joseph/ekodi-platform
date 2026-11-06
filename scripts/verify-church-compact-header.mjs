import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APPROVED_UPSTREAM = new Map([
  [142, '1607bc1c06157c420afabe3bfc62cca9073738c8'],
  [143, '9e8fc072d1d6d66286d9a275fe3960e50e5c5e72'],
  [144, 'b752da0de6520b934b585a1c2a75d8e7af065ac7'],
  [146, 'b79dc3b19b562f9b654bffb55d797ea336c08d34'],
  [149, 'b89c32f9330afbd114dc632306a7b9348c869b7b']
]);
const LINKS = [
  ['/ekodichurch/devotion/', '매일묵상'],
  ['/ekodichurch/#worship', '예배·방송'],
  ['/ekodichurch/notices/', '공지사항'],
  ['/ekodichurch/schedule/', '주요일정'],
  ['/ekodichurch/#together', '함께하기'],
  ['/ekodichurch/my/', '마이페이지']
];
const PAGES = ['index.html', 'devotion/index.html', 'notices/index.html', 'schedule/index.html'];
const fail = message => { throw new Error('Church six-navigation release blocked: ' + message); };

export function verifyChurchCompactHeader(sourceDir, manifestFile) {
  const manifest = JSON.parse(readFileSync(resolve(manifestFile), 'utf8'));
  if (manifest.sourceRepository !== 'topmaster-joseph/ekodi-church' ||
      manifest.sourceCommit !== '520d4f2daf7e5e4dc53bf928c9df626b5f896600') {
    fail('original reviewed-source identity was modified');
  }
  const pulls = manifest.reviewedOverlays?.pullRequests;
  if (!Array.isArray(pulls)) fail('reviewed upstream PR provenance is missing');
  for (const [number, headSha] of APPROVED_UPSTREAM) {
    const matches = pulls.filter(p => p.number === number && p.headSha === headSha);
    if (matches.length !== 1) fail('missing or changed exact reviewed PR SHA: #' + number);
  }
  const file = name => {
    const path = resolve(sourceDir, name);
    if (!existsSync(path)) fail('missing source asset: ' + name);
    return readFileSync(path, 'utf8');
  };
  for (const filename of PAGES) {
    const html = file(filename);
    const nav = html.match(/<nav\s+id="main-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    if (!nav) fail(filename + ': missing shared header navigation');
    const anchors = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({
      href: m[1].match(/\bhref="([^"]+)"/)?.[1],
      text: m[2].replace(/<[^>]+>/g, '').trim()
    }));
    if (JSON.stringify(anchors) !== JSON.stringify(LINKS)) fail(filename + ': primary links differ from reviewed six-link contract');
    if (!html.includes('church-compact-navigation.css')) fail(filename + ': missing responsive menu CSS');
    if (nav.includes('오늘의 삶') || nav.includes('큐티인 신청') || nav.includes('예배자료')) fail(filename + ': legacy item returned to primary menu');
  }
  const home = file('index.html');
  if (!home.includes('church-section-nav.js') ||
      !home.includes('data-church-notices') ||
      !home.includes('data-church-shared-schedules') ||
      home.includes('id="life-hub"') ||
      home.includes('data-ekodi-life-hub')) fail('home selected-panel, public-board or legacy-life contract is incorrect');
  const script = file('church-section-nav.js');
  const css = file('church-compact-navigation.css');
  if (!script.includes('hashchange') || !script.includes('church-section-active') ||
      !css.includes('church-section-active') ||
      !css.includes('min-height:44px')) fail('selected-panel or touch-target runtime missing');
  return { upstreamHead: APPROVED_UPSTREAM.get(149), pages: PAGES.length, links: LINKS.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceIndex = process.argv.indexOf('--source');
  const manifestIndex = process.argv.indexOf('--manifest');
  if (sourceIndex < 0 || manifestIndex < 0 || !process.argv[sourceIndex + 1] || !process.argv[manifestIndex + 1]) {
    fail('expected --source <directory> --manifest <file>');
  }
  console.log('Verified Church compact release contract:', verifyChurchCompactHeader(process.argv[sourceIndex + 1], process.argv[manifestIndex + 1]));
}