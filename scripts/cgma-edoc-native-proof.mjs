// 청계면상인회 전자문서 · 순차 전자서명 실증 (EKODI native browser proof).
//
// Real Chromium loads https://ekodi.kr/... ; every request is answered by the SAME modules that run in
// production (cgma-edoc-api.js, cgma-edoc-sign-route.js, prototypes/cgma-edoc-sign.*, cgma-edoc-admin.*)
// over a real SQLite database built from the production migration. Because the browser origin is
// https://ekodi.kr, the production CSP headers, same-origin write guard and fragment token all apply.
// Only two things are substituted: administrator sign-in (a fixed proof token mapped to cgma authority)
// and object storage (in-memory R2). Nothing is written to production.
//
// Usage: node scripts/cgma-edoc-native-proof.mjs <document.pdf> <outDir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { handleCgmaEdocs } from '../cgma-edoc-api.js';
import { routeCgmaEdocSign } from '../cgma-edoc-sign-route.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const ROOT = new URL('../', import.meta.url);
const [pdfPath, outDir = 'artifacts/cgma-edoc-native-proof'] = process.argv.slice(2);
if (!pdfPath) { console.error('usage: node scripts/cgma-edoc-native-proof.mjs <document.pdf> [outDir]'); process.exit(2); }
const ADMIN_CSP = "default-src 'self'; style-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const read = rel => fs.readFile(new URL(rel, ROOT));
await fs.mkdir(outDir, { recursive: true });

// ---------- production modules over a real database ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await fs.readFile(new URL('migrations/202610250500_cgma_edocs.sql', ROOT), 'utf8'));
sqlite.exec(await fs.readFile(new URL('migrations/202610280400_cgma_edocs_archive.sql', ROOT), 'utf8'));
sqlite.exec(await fs.readFile(new URL('migrations/202610280600_cgma_edocs_source_url.sql', ROOT), 'utf8'));
// The outside web as seen by the server-side link import: one public Google Doc, one private Google Doc.
const PUBLIC_DOC = 'https://docs.google.com/document/d/1PublicProofDoc000000000000/edit?usp=sharing';
const PRIVATE_DOC = 'https://docs.google.com/document/d/1PrivateProofDoc00000000000/edit';
const linkFetches = [];
const webFetch = async url => {
  linkFetches.push(url);
  if (url.includes('1PublicProofDoc')) return new Response(await fs.readFile(pdfPath), { headers: { 'content-type': 'application/pdf', 'content-disposition': "attachment; filename*=UTF-8''%ED%9A%8C%EC%9D%98%EB%A1%9D.pdf" } });
  if (url.includes('1PrivateProofDoc')) return new Response('<html>Sign in</html>', { headers: { 'content-type': 'text/html' } });
  return new Response('nf', { status: 404 });
};
const stmt = (sql, params = []) => ({
  bind: (...v) => stmt(sql, v),
  first: async () => sqlite.prepare(sql).get(...params) || null,
  all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
  run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
});
let chain = Promise.resolve();
const DB = { prepare: sql => stmt(sql), batch(list) {
  const run = chain.then(async () => { sqlite.exec('BEGIN'); try { const out = []; for (const s of list) out.push(await s.run()); sqlite.exec('COMMIT'); return out; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } });
  chain = run.catch(() => {}); return run;
} };
const objects = new Map();
const R2 = { async put(k, b, o) { objects.set(k, { bytes: new Uint8Array(b), type: o?.httpMetadata?.contentType }); },
  async get(k) { const v = objects.get(k); return v ? { body: v.bytes } : null; }, async delete(k) { objects.delete(k); } };
const env = { DB, CGMA_EDOC_FILES: R2, ASSETS: { async fetch(request) {
  const p = new URL(request.url).pathname;
  const map = { '/cgma/sign/': ['prototypes/cgma-edoc-sign.html', 'text/html; charset=utf-8'], '/cgma/sign/app.js': ['prototypes/cgma-edoc-sign.js', 'text/javascript; charset=utf-8'] };
  return map[p] ? new Response(await read(map[p][0]), { headers: { 'content-type': map[p][1] } }) : new Response('Not Found', { status: 404 });
} } };
const resolveAuthority = async request => request.headers.get('authorization') === 'Bearer proof-admin'
  ? { ok: true, scope: 'tenant', email: 'proof-admin@cgma.or.kr', role: 'owner' } : { ok: false, status: 401 };

const ADMIN_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>청계면상인회 관리자 · 전자문서 (실증)</title><link rel="stylesheet" href="/proof-admin.css"></head>
<body><header class="proof-head">청계면상인회 관리자 · 전자문서 · 서명</header><section id="summaryCards" class="cards"></section><main id="mainPanel"></main><p id="shellState" class="proof-state"></p><script type="module" src="/proof-admin.js"></script></body></html>`;
const ADMIN_JS = `import {mountCgmaEdocAdmin} from '/cgma/admin/assets/cgma-edoc-admin.js?v=proof';
mountCgmaEdocAdmin({root:document.getElementById('mainPanel'),summaryRoot:document.getElementById('summaryCards'),getToken:async()=>'proof-admin',state:t=>{document.getElementById('shellState').textContent=t}});`;
const ADMIN_CSS = 'body{margin:0;font:15px/1.6 system-ui,"Noto Sans KR",sans-serif;background:#f6f8f7;color:#14302f}.proof-head{background:#0f5f5c;color:#fff;padding:14px 20px;font-weight:700}.cards{display:flex;gap:10px;padding:14px 20px;flex-wrap:wrap}.cards .card{background:#fff;border:1px solid #d6e0de;border-radius:10px;padding:10px 14px;display:grid;min-width:120px}main{background:#fff;margin:0 20px 20px;padding:18px;border:1px solid #d6e0de;border-radius:12px}.proof-state{padding:0 20px;color:#5b6b69}';

async function answer(route) {
  const req = route.request();
  const url = new URL(req.url());
  const headers = new Headers(await req.allHeaders());
  const body = ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer();
  const request = new Request(url.toString(), { method: req.method(), headers, body });
  let response = null;
  if (url.pathname.startsWith('/api/cgma/edocs')) response = await handleCgmaEdocs(request, env, { resolveAuthority, fetch: webFetch });
  else if (url.pathname.startsWith('/cgma/sign')) response = await routeCgmaEdocSign(request, env);
  else if (url.pathname === '/cgma/admin/assets/cgma-edoc-admin.js') response = new Response(await read('cgma-edoc-admin.js'), { headers: { 'content-type': 'text/javascript', 'content-security-policy': ADMIN_CSP } });
  else if (url.pathname === '/cgma/admin/assets/cgma-edoc-admin.css') response = new Response(await read('cgma-edoc-admin.css'), { headers: { 'content-type': 'text/css' } });
  else if (url.pathname === '/cgma/admin/edocs') response = new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ADMIN_CSP } });
  else if (url.pathname === '/proof-admin.js') response = new Response(ADMIN_JS, { headers: { 'content-type': 'text/javascript' } });
  else if (url.pathname === '/proof-admin.css') response = new Response(ADMIN_CSS, { headers: { 'content-type': 'text/css' } });
  if (!response) return route.fulfill({ status: 404, body: 'proof: not served' });
  const buf = Buffer.from(await response.arrayBuffer());
  return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: buf });
}

// ---------- proof ----------
const report = { schema: 'ekodi.cgma-edoc-native-proof.v1', executedAt: new Date().toISOString(), origin: 'https://ekodi.kr (browser origin; responses from production modules)',
  substituted: ['administrator sign-in (proof token mapped to cgma tenant authority)', 'object storage (in-memory R2)'], productionMutations: false, checks: [], screenshots: [], consoleProblems: [] };
const check = (name, passed, detail = {}) => { report.checks.push({ name, passed: !!passed, ...detail }); console.log((passed ? 'PASS ' : 'FAIL ') + name + (Object.keys(detail).length ? ' ' + JSON.stringify(detail) : '')); };
const shot = async (page, name, opts = {}) => { const file = path.join(outDir, name + '.png'); await page.screenshot({ path: file, fullPage: true, ...opts }); report.screenshots.push(file); };

const browser = await chromium.launch({ headless: true });
const watch = (page, label) => {
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /Refused to|Content Security Policy/i.test(t)) report.consoleProblems.push(`${label}: ${t}`); });
  page.on('pageerror', e => report.consoleProblems.push(`${label} pageerror: ${e.message}`));
};
async function context(mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' }
    : { viewport: { width: 1366, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', acceptDownloads: true });
  await ctx.route('https://ekodi.kr/**', answer);
  return ctx;
}
async function drawSignature(page, seed) {
  await page.locator('canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('canvas').boundingBox();
  const pts = Array.from({ length: 28 }, (_, i) => [box.x + box.width * (0.12 + i * 0.027), box.y + box.height * (0.5 + 0.28 * Math.sin(i / 2.2 + seed))]);
  await page.mouse.move(...pts[0]); await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...p, { steps: 2 });
  await page.mouse.up();
}

try {
  // 1. Administrator registers the real proposal PDF with the default 총무 → 사무국장 → 상인회장 chain.
  const adminCtx = await context(false);
  const admin = await adminCtx.newPage(); watch(admin, 'admin');
  await admin.goto('https://ekodi.kr/cgma/admin/edocs');
  await admin.getByRole('button',{name:'+ 새 전자문서'}).click();
  const roles = await admin.locator('.cgma-edoc-signers-edit li input:first-child').evaluateAll(els => els.map(e => e.value));
  check('기본 서명 순서가 총무 → 사무국장 → 상인회장', JSON.stringify(roles) === JSON.stringify(['총무', '사무국장', '상인회장']), { roles });
  await admin.locator('.cgma-edoc-form input[type="text"]').first().fill('청계면상인회 홈페이지 제안서 및 견적서 (실증)');
  await admin.locator('select').first().selectOption('제안서·견적서');
  await admin.locator('input[type="file"]').setInputFiles(pdfPath);
  const names = ['실증총무', '실증국장', '정찬균'];
  const nameInputs = admin.locator('.cgma-edoc-signers-edit li input:nth-child(2)');
  for (let i = 0; i < 3; i++) await nameInputs.nth(i).fill(names[i]);
  await shot(admin, '01-admin-new-document');
  await admin.getByRole('button',{name:'서명 요청 시작'}).click();
  await admin.locator('.cgma-edoc-chain').waitFor();
  const docNo = await admin.locator('.cgma-edoc-meta dd').first().textContent();
  check('문서 등록 · 서명 요청 시작', /^CGMA-\d{4}-0001$/.test(docNo), { docNo });
  await shot(admin, '02-admin-request-started');
  const detail = await admin.evaluate(async () => {
    const list = await (await fetch('/api/cgma/edocs', { headers: { authorization: 'Bearer proof-admin' } })).json();
    return (await fetch('/api/cgma/edocs/' + list.documents[0].id, { headers: { authorization: 'Bearer proof-admin' } })).json();
  });
  const links = detail.signers.map(s => s.link);
  check('서명자별 링크 발급 (ekodi.kr/cgma/sign/#…)', links.every(l => /^https:\/\/ekodi\.kr\/cgma\/sign\/#[A-Za-z0-9_-]{43}$/.test(l)), { count: links.length });

  // 2. Mobile: 사무국장 opens first — must be held for 총무.
  const mobile = await context(true);
  const p2 = await mobile.newPage(); watch(p2, 'signer2');
  await p2.goto(links[1]);
  await p2.locator('.chain').waitFor();
  const waitingText = await p2.locator('.notice').first().textContent();
  check('순서 강제: 사무국장 링크는 총무 서명 전 잠김', /앞 순서\(총무 실증총무\)/.test(waitingText) && await p2.locator('canvas').count() === 0, { notice: waitingText.trim() });
  await shot(p2, '03-mobile-signer2-waiting');

  // 3. Each signer in order on a phone: open document, agree, name, draw, sign.
  for (let i = 0; i < 3; i++) {
    const page = await mobile.newPage(); watch(page, 'signer' + (i + 1));
    await page.goto(links[i]);
    await page.locator('canvas').waitFor();
    if (i === 0) {
      await page.getByRole('button',{name:/^문서 열기/}).click();
      await page.locator('iframe.preview').waitFor();
      const src = await page.locator('iframe.preview').getAttribute('src');
      check('원본 PDF 미리보기(blob, CSP 허용)', /^blob:https:\/\/ekodi\.kr\//.test(src));
      await shot(page, '04-mobile-signer1-document');
    }
    await page.locator('#agree').check();
    await page.locator('#signedName').fill(names[i]);
    await drawSignature(page, i);
    if (i === 0) await shot(page, '05-mobile-signer1-before-submit');
    const before = Date.now();
    await page.getByRole('button',{name:'서명하기',exact:true}).click();
    try { await page.locator('.notice[data-kind="ok"]').first().waitFor({ timeout: 15000 }); }
    catch (error) {
      const notices = await page.locator('.notice').allTextContents();
      await shot(page, `error-signer${i + 1}`);
      throw new Error(`signer ${i + 1} did not complete: ${JSON.stringify(notices)}`);
    }
    const state = await page.evaluate(async () => (await fetch('/api/cgma/edocs/sign', { headers: { 'x-ekodi-sign-token': location.hash.slice(1) } })).json());
    const me = state.signers[i];
    const signedAt = Date.parse(me.signed_at);
    check(`${i + 1}번째 서명(${me.role_title}) 완료 · 서버 시각 기록`, me.status === 'signed' && signedAt >= before - 2000 && signedAt <= Date.now() + 2000 && me.signature.length > 0,
      { signed_at: me.signed_at, kst: new Date(signedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) });
    if (i < 2) check(`다음 순서(${state.signers[i + 1].role_title}) 활성화`, state.signers[i + 1].status === 'active');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${i + 1}번째 서명 화면: 휴대폰 가로 넘침 없음`, overflow <= 1, { overflowPx: overflow });
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.chain li')].some(li => { const r = li.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; }));
    check(`${i + 1}번째 서명 화면: 서명 순서 카드 3개 모두 화면 안`, !clipped);
    if (i === 2) { check('마지막 서명 후 문서 완료', state.document.status === 'completed'); await shot(page, '06-mobile-signer3-certificate'); }
    await page.close();
  }

  // 4. Administrator: completed record, certificate, intact hash chain; print view.
  await admin.reload();
  await admin.locator('.cgma-edoc-row').first().click();
  await admin.locator('.cgma-edoc-cert').waitFor();
  const history = await admin.locator('.cgma-edoc-history summary').textContent();
  check('관리자: 서명 확인서 · 이력 무결성 정상', /무결성 정상/.test(history), { history: history.trim() });
  const sigCount = await admin.locator('.cgma-edoc-cert svg.cgma-edoc-sig').count();
  check('관리자 CSP에서 서명 3개가 인라인 SVG로 표시', sigCount === 3, { sigCount });
  await shot(admin, '07-admin-completed');
  await admin.emulateMedia({ media: 'print' });
  await shot(admin, '08-admin-print-certificate');
  await admin.emulateMedia({ media: 'screen' });
  const audit = await admin.evaluate(async () => {
    const list = await (await fetch('/api/cgma/edocs', { headers: { authorization: 'Bearer proof-admin' } })).json();
    const d = await (await fetch('/api/cgma/edocs/' + list.documents[0].id, { headers: { authorization: 'Bearer proof-admin' } })).json();
    return { actions: d.events.map(e => e.action), chain_valid: d.chain_valid, sha: d.document.content_sha256 };
  });
  check('처리 이력: 등록→원본→시작→서명×3→완료', audit.actions.join(',') === 'created,file_uploaded,started,signed,signed,signed,completed' && audit.chain_valid, audit);
  const pdfSha = (await import('node:crypto')).createHash('sha256').update(await fs.readFile(pdfPath)).digest('hex');
  check('문서 지문 = 원본 PDF의 SHA-256', audit.sha === pdfSha, { sha256: pdfSha });
  // 5. 보관 문서: register a records-only document (no signatures) and confirm 연번 in the list.
  await admin.getByRole('button', { name: '목록으로' }).first().click();
  await admin.getByRole('button', { name: '+ 새 전자문서' }).click();
  await admin.locator('input[name="cgmaEdocMode"][value="archive"]').check();
  check('보관 모드: 서명자 입력란 숨김', await admin.locator('.cgma-edoc-signer-section').isHidden());
  await admin.locator('.cgma-edoc-form input[type="text"]').first().fill('2026년 청계면 상인회 상반기 결산 (실증)');
  await admin.locator('select').first().selectOption('회계·정산');
  await admin.locator('input[type="date"]').fill('2026-06-24');
  await admin.locator('input[type="file"]').setInputFiles(pdfPath);
  await admin.getByRole('button', { name: '보관 등록' }).click();
  await admin.locator('.cgma-edoc-head').waitFor();
  const archivedBadge = await admin.locator('.cgma-edoc-head .cgma-edoc-badge').textContent();
  check('보관 등록 → 상태 ‘보관’', archivedBadge === '보관', { badge: archivedBadge });
  await admin.getByRole('button', { name: '목록으로' }).first().click();
  await admin.locator('.cgma-edoc-row').first().waitFor();
  const serials = await admin.locator('.cgma-edoc-serial').allTextContents();
  const head = await admin.locator('.cgma-edoc-table thead th').first().textContent();
  check('문서 목록 첫 열 ‘연번’, 최신순 2·1', head === '연번' && JSON.stringify(serials) === JSON.stringify(['2', '1']), { head, serials });
  await shot(admin, '09-admin-list-serial-archive');
  // 6. 일괄 등록: several files + manifest in one selection.
  // (ASCII file names: this sandbox's Playwright drops non-ASCII names in multi-file selection; real browsers do not.)
  const bulkDir = path.join(outDir, 'bulk'); await fs.mkdir(bulkDir, { recursive: true });
  const pdfCopy = path.join(bulkDir, '240726_urban-regeneration-direction.pdf'); await fs.copyFile(pdfPath, pdfCopy);
  const hwp = path.join(bulkDir, 'settlement-2026-h1.hwp'); await fs.writeFile(hwp, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(64).fill(0)]));
  const manifestPath = path.join(bulkDir, 'cgma-edocs-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ schema: 'cgma-edocs-manifest.v1', documents: [
    { file: 'settlement-2026-h1.hwp', title: '2026년 상반기 결산 (실증)', category: '회계·정산', doc_date: '2026-06-24', mode: 'archive' }] }));
  await admin.getByRole('button', { name: '일괄 등록' }).click();
  await admin.locator('.cgma-edoc-bulk input[type="file"]').setInputFiles([pdfCopy, hwp, manifestPath]);
  await admin.locator('.cgma-edoc-bulk tbody tr').nth(1).waitFor({ timeout: 8000 });
  const proposed = await admin.locator('.cgma-edoc-bulk tbody tr').evaluateAll(rows => rows.map(r => [r.cells[1].textContent, r.querySelector('input[type=text]').value, r.querySelector('select').value, r.querySelector('input[type=date]').value]));
  check('일괄 등록: manifest 반영 + 파일명 날짜 추정', proposed.some(r => r[1] === '2026년 상반기 결산 (실증)' && r[2] === '회계·정산' && r[3] === '2026-06-24') && proposed.some(r => r[3] === '2024-07-26'), { proposed });
  await admin.getByRole('button', { name: '등록 시작' }).click();
  await admin.waitForFunction(() => [...document.querySelectorAll('.cgma-edoc-bulk-state')].every(td => /완료|실패/.test(td.textContent)), null, { timeout: 30000 });
  const states = await admin.locator('.cgma-edoc-bulk-state').allTextContents();
  check('일괄 등록: 2건 모두 완료(한글 HWP 보관 포함)', states.every(t => t === '완료'), { states });
  await shot(admin, '10-admin-bulk-registered');
  await admin.getByRole('button', { name: '목록으로' }).click();
  await admin.locator('.cgma-edoc-row').nth(3).waitFor();
  const serialsAfter = await admin.locator('.cgma-edoc-serial').allTextContents();
  check('일괄 등록 후 연번 4·3·2·1', JSON.stringify(serialsAfter) === JSON.stringify(['4', '3', '2', '1']), { serialsAfter });
  // 7. 링크로 등록: a Google Docs link becomes a stored PDF copy.
  await admin.getByRole('button', { name: '+ 새 전자문서' }).click();
  await admin.locator('input[name="cgmaEdocMode"][value="archive"]').check();
  await admin.locator('input[name="cgmaEdocKind"][value="link"]').check();
  await admin.locator('.cgma-edoc-form input[type="text"]').first().fill('10월 정기회의 회의록 (구글 문서 링크)');
  await admin.locator('.cgma-edoc-form input[type="url"]').fill(PUBLIC_DOC);
  await admin.getByRole('button', { name: '보관 등록' }).click();
  await admin.locator('.cgma-edoc-head').waitFor();
  const linkMeta = await admin.locator('.cgma-edoc-meta').textContent();
  const linkHref = await admin.locator('.cgma-edoc-meta a').getAttribute('href');
  check('링크 등록: 구글 문서 → PDF 사본 보관 + 원문 링크 표시', /회의록\.pdf/.test(linkMeta) && linkHref === PUBLIC_DOC
    && (await admin.locator('.cgma-edoc-head .cgma-edoc-badge').textContent()) === '보관' && linkFetches.some(u => /\/export\?format=pdf$/.test(u)), { linkHref });
  await shot(admin, '11-admin-link-registered');
  // 8. 일괄 등록: paste links; a private one is kept as link-only record.
  await admin.getByRole('button', { name: '목록으로' }).first().click();
  await admin.getByRole('button', { name: '일괄 등록' }).click();
  await admin.locator('.cgma-edoc-bulk textarea').fill(`공개 회의록 | ${PUBLIC_DOC.replace('edit?usp=sharing', 'view')}\n${PRIVATE_DOC}\n주소 아님`);
  await admin.getByRole('button', { name: '링크 추가' }).click();
  const linkRows = await admin.locator('.cgma-edoc-bulk tbody tr').evaluateAll(rows => rows.map(r => r.querySelector('input[type=text]').value));
  check('일괄 링크: 제목|링크 형식 + 제목 자동(구글 문서), 잘못된 줄 제외', JSON.stringify(linkRows) === JSON.stringify(['공개 회의록', '구글 문서']), { linkRows });
  await admin.getByRole('button', { name: '등록 시작' }).click();
  await admin.waitForFunction(() => [...document.querySelectorAll('.cgma-edoc-bulk-state')].every(td => /완료|실패/.test(td.textContent)), null, { timeout: 30000 });
  const linkStates = await admin.locator('.cgma-edoc-bulk-state').allTextContents();
  check('일괄 링크: 공개는 사본, 비공개는 링크만 보관', JSON.stringify(linkStates) === JSON.stringify(['완료', '완료 · 링크만(사본 없음)']), { linkStates });
  await shot(admin, '12-admin-bulk-links');
  await admin.getByRole('button', { name: '목록으로' }).click();
  await admin.locator('.cgma-edoc-row').nth(6).waitFor();
  const serialsLinks = await admin.locator('.cgma-edoc-serial').allTextContents();
  check('링크 등록 후 연번 7…1', JSON.stringify(serialsLinks) === JSON.stringify(['7', '6', '5', '4', '3', '2', '1']), { serialsLinks });
  // 9. 화면 배치: a draft (names to fill in later) lays out facts left / work right on desktop, one column on a phone.
  await admin.getByRole('button', { name: '+ 새 전자문서' }).click();
  await admin.locator('.cgma-edoc-form input[type="text"]').first().fill('청계면상인회 홈페이지 제안서 및 견적서 (배치 실증)');
  await admin.locator('input[type="file"]').setInputFiles(pdfPath);
  await admin.getByRole('button', { name: '초안으로 저장' }).click();
  await admin.locator('.cgma-edoc-detail-grid').waitFor();
  const layout = await admin.evaluate(() => {
    const [left, right] = [...document.querySelector('.cgma-edoc-detail-grid').children].map(n => n.getBoundingClientRect());
    const wide = [...document.querySelectorAll('.cgma-edoc-draft .cgma-edoc-btn')].map(b => b.getBoundingClientRect().width);
    return { sideBySide: right.left >= left.right - 1 && Math.abs(right.top - left.top) < 4, maxButton: Math.round(Math.max(...wide)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check('배치(데스크톱): 문서 정보 왼쪽 · 할 일 오른쪽, 버튼이 가로로 늘어나지 않음', layout.sideBySide && layout.maxButton < 260 && layout.overflow <= 1, layout);
  await shot(admin, '13-admin-draft-layout-desktop');
  const draftUrl = admin.url();
  const phoneCtx = await context(true);
  const phone = await phoneCtx.newPage(); watch(phone, 'admin-phone');
  await phone.goto('https://ekodi.kr/cgma/admin/edocs');
  await phone.locator('.cgma-edoc-row').first().click();
  await phone.locator('.cgma-edoc-detail-grid').waitFor();
  const phoneLayout = await phone.evaluate(() => {
    const [left, right] = [...document.querySelector('.cgma-edoc-detail-grid').children].map(n => n.getBoundingClientRect());
    const chain = [...document.querySelectorAll('.cgma-edoc-chain li')].map(li => li.getBoundingClientRect());
    return { stacked: right.top >= left.bottom - 1, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      chainVisible: chain.length === 3 && chain.every(r => r.right <= innerWidth + 1 && r.left >= -1) };
  });
  check('배치(휴대폰): 한 열로 쌓이고 서명 순서 3개 모두 보임 · 가로 넘침 없음', phoneLayout.stacked && phoneLayout.overflow <= 1 && phoneLayout.chainVisible, phoneLayout);
  await shot(phone, '14-admin-draft-layout-phone');
  void draftUrl;
  // The private link's import answers 422 by design (then link-only is recorded); every other console problem fails.
  const unexpected = report.consoleProblems.filter(p => !/status of 422/.test(p));
  check('브라우저 콘솔 · CSP 위반 없음 (비공개 링크의 의도된 422 제외)', unexpected.length === 0 && report.consoleProblems.length <= 1, { problems: report.consoleProblems });
} finally {
  await browser.close();
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
}
const failed = report.checks.filter(c => !c.passed);
console.log(`\n${report.checks.length - failed.length}/${report.checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
