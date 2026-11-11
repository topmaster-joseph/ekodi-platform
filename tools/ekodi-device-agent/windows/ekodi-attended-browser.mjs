#!/usr/bin/env node
/**
 * EKODI Attended Operator Browser — ATTENDED-OPERATOR-BROWSER-001 (Constitution v1.27.9 §1D-1).
 *
 * Operator-initiated, operator-present browser runs for console steps that need the operator's own
 * provider sign-in. This is NOT automatic execution: AI agents, the Orchestrator, schedulers and
 * remote providers must never start it (enforced below and by test/attended-operator-browser.test.mjs).
 *
 * - New single-use EKODI profile in a visible window; never the operator's own browser/profile/cookies.
 * - The operator signs in. The runner never asks for, types or stores passwords/OTP.
 * - Only registered recipes run; main-frame navigation is limited to each recipe's origins.
 * - The operator approves the whole recipe once at start (run-level approval, Constitution v1.27.10).
 * - A secret moves only to the recipe's declared destination, in memory, never logged; profile deleted at exit.
 *
 * Usage (on the operator's PC):  node ekodi-attended-browser.mjs --recipe gmail-operator-notify [--plan]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, appendFile, mkdir, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

export const POLICY_ID = 'ATTENDED-OPERATOR-BROWSER-001';
export const FORBIDDEN_INITIATOR_ENV = Object.freeze([
  'CI', 'GITHUB_ACTIONS', 'EKODI_ORCHESTRATOR_TASK_ID', 'EKODI_AGENT_RUN', 'EKODI_SCHEDULED_RUN',
  'EKODI_DEVICE_CONTROL_JOB', 'EKODI_HYBRID_EXECUTION', 'EKODI_REMOTE_PROVIDER_JOB',
]);
const SECRET_PATTERN = /GOCSPX-[A-Za-z0-9_-]{20,}/g;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const GMAIL = Object.freeze({
  project: 'ekodi-platform',
  clientId: '483044030492-ej1ie2boa4e01lglm75e9q1r6m25pkp2.apps.googleusercontent.com',
  redirectUri: 'https://ekodi.kr/api/mail/control/oauth/google/callback',
  testUser: 'ekodibiz@gmail.com',
  repo: 'topmaster-joseph/ekodi-platform',
  secretName: 'MAIL_GOOGLE_CLIENT_SECRET',
});

/** Versioned recipe registry. Adding/widening a recipe is a governed code change with tests. */
export const RECIPES = Object.freeze({
  'gmail-operator-notify': Object.freeze({
    title: '에코디 운영자 알림용 Gmail 연결 준비',
    // Google sign-in may pass through www.google.com / accounts.google.co.kr in the main frame.
    origins: Object.freeze(['https://ekodi.kr', 'https://console.cloud.google.com', 'https://accounts.google.com', 'https://accounts.google.co.kr', 'https://www.google.com', 'https://github.com']),
    secretDestination: Object.freeze({ kind: 'github-actions-secret', repo: GMAIL.repo, name: GMAIL.secretName }),
    steps: Object.freeze([
      { id: 'google-sign-in', kind: 'sign-in', changesState: false,
        url: `https://console.cloud.google.com/home/dashboard?project=${GMAIL.project}`, readyOrigin: 'https://console.cloud.google.com',
        say: '열린 창에서 Google(에코디 프로젝트 관리자 계정)으로 직접 로그인하세요. 로그인되면 자동으로 다음 단계로 갑니다.' },
      { id: 'enable-gmail-api', kind: 'click', changesState: true,
        url: `https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=${GMAIL.project}`,
        texts: ['사용', 'Enable', 'ENABLE'], doneTexts: ['관리', 'Manage', 'API 사용 설정됨', 'API enabled'],
        say: 'Gmail API를 사용 설정합니다.' },
      { id: 'add-redirect-uri', kind: 'insert-text', changesState: true,
        url: `https://console.cloud.google.com/auth/clients/${GMAIL.clientId}?project=${GMAIL.project}`,
        text: GMAIL.redirectUri, highlight: ['URI 추가', 'Add URI'],
        say: '「승인된 리디렉션 URI」에서 「URI 추가」를 누르고, 새로 생긴 빈 칸을 한 번 클릭해 두세요. 그다음 여기서 y를 누르면 주소를 입력합니다. 입력 후 화면 아래 「저장」은 사장님이 눌러 주세요.' },
      { id: 'create-client-secret', kind: 'capture-secret', changesState: true,
        url: `https://console.cloud.google.com/auth/clients/${GMAIL.clientId}?project=${GMAIL.project}`,
        texts: ['보안 비밀번호 추가', 'Add secret'],
        say: '새 클라이언트 보안 비밀번호를 만듭니다(기존 비밀번호는 지우지 않습니다). 값은 화면 밖으로 내보내지 않고 다음 단계에서 GitHub에만 넣습니다.' },
      { id: 'github-sign-in', kind: 'sign-in', changesState: false,
        url: `https://github.com/${GMAIL.repo}/settings/secrets/actions/new`, readyOrigin: 'https://github.com', readyPath: '/settings/secrets/actions/new',
        say: '같은 창에서 GitHub에 직접 로그인하세요. 비밀값 등록 화면이 열리면 다음 단계로 갑니다.' },
      { id: 'store-github-secret', kind: 'store-secret', changesState: true,
        url: `https://github.com/${GMAIL.repo}/settings/secrets/actions/new`,
        say: `GitHub 비밀값 ${GMAIL.secretName} 에 방금 만든 보안 비밀번호를 넣고 저장합니다.` },
      { id: 'add-test-user', kind: 'insert-text', changesState: true, optional: true,
        url: `https://console.cloud.google.com/auth/audience?project=${GMAIL.project}`,
        text: GMAIL.testUser, highlight: ['사용자 추가', 'Add users', 'ADD USERS'],
        say: '앱이 「테스트」 상태라면 「사용자 추가」를 누르고 이메일 칸을 클릭해 두세요(「프로덕션」이면 n을 눌러 건너뜁니다). Enter를 누르면 ekodibiz@gmail.com을 입력합니다. 입력 후 「저장」은 사장님이 눌러 주세요.' },
      { id: 'ekodi-sign-in', kind: 'sign-in', changesState: false,
        url: 'https://ekodi.kr/mail/admin#accounts', readyOrigin: 'https://ekodi.kr', readyPath: '/mail/admin',
        say: '에코디 메일 관리 화면입니다. 로그인 화면이 나오면 에코디 계정으로 직접 로그인하세요.' },
      { id: 'ekodi-connect-gmail', kind: 'click', changesState: true, noNavigate: true,
        url: 'https://ekodi.kr/mail/admin#accounts', texts: ['Gmail 읽기·발송 연결'], doneTexts: ['연결됨'], awaitDoneOrigin: 'https://ekodi.kr',
        say: 'ekodibiz@gmail.com 계정의 「Gmail 읽기·발송 연결」을 누릅니다. 이어지는 Google 화면에서 ekodibiz@gmail.com을 선택하고 「허용」은 사장님이 눌러 주세요.' },
    ]),
  }),
});

/** Refuse any non-operator initiator. */
export function assertOperatorStart({ env = process.env, stdin = process.stdin } = {}) {
  const hit = FORBIDDEN_INITIATOR_ENV.find((k) => String(env[k] ?? '').trim() !== '');
  if (hit) throw new Error('ATTENDED_FORBIDDEN_INITIATOR:' + hit);
  if (!stdin?.isTTY) throw new Error('ATTENDED_REQUIRES_INTERACTIVE_OPERATOR');
  return true;
}

export function getRecipe(id) {
  const recipe = Object.prototype.hasOwnProperty.call(RECIPES, id) ? RECIPES[id] : null;
  if (!recipe) throw new Error('ATTENDED_RECIPE_NOT_REGISTERED');
  return recipe;
}

/** Main-frame documents must stay on the recipe's origins; subframes must at least be https. */
export function navigationAllowed(rawUrl, recipe, { mainFrame = true } = {}) {
  let u; try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol === 'about:' || u.protocol === 'data:') return !mainFrame || rawUrl === 'about:blank';
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  return mainFrame ? recipe.origins.includes(u.origin) : true;
}

/** Remove secret-looking material from anything that may be printed or audited. */
export function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value.replace(SECRET_PATTERN, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = /secret|password|token|value|otp/i.test(k) ? '[REDACTED]' : redact(v);
    return out;
  }
  return value;
}

export function extractClientSecret(text) {
  const found = String(text || '').match(SECRET_PATTERN) || [];
  const unique = [...new Set(found)];
  return unique.length === 1 ? unique[0] : null; // ambiguous or absent → do not guess
}

export function renderPlan(recipe) {
  return [`[${POLICY_ID}] ${recipe.title}  — 시작할 때 한 번만 승인`, ...recipe.steps.map((s, i) => `${i + 1}. ${s.say}${s.changesState ? '  (설정 변경)' : ''}${s.optional ? '  (선택)' : ''}`),
    `비밀값 목적지: ${recipe.secretDestination.kind} ${recipe.secretDestination.repo} / ${recipe.secretDestination.name}`].join('\n');
}

export function auditDir(env = process.env) {
  const base = env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'EKODI', 'attended-browser');
}

export function makeAudit({ dir = auditDir(), runId = new Date().toISOString().replace(/[:.]/g, '-'), write = appendFile, ensure = mkdir } = {}) {
  let ready = null;
  return async (event) => {
    ready ??= ensure(dir, { recursive: true }).catch(() => {});
    await ready;
    const line = JSON.stringify(redact({ at: new Date().toISOString(), runId, policy: POLICY_ID, ...event })) + '\n';
    await write(path.join(dir, 'audit.jsonl'), line).catch(() => {});
  };
}

export function browserPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [path.win32.join(pf, 'Google/Chrome/Application/chrome.exe'), path.win32.join(pf86, 'Google/Chrome/Application/chrome.exe'),
      path.win32.join(pf, 'Microsoft/Edge/Application/msedge.exe'), path.win32.join(pf86, 'Microsoft/Edge/Application/msedge.exe')];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/* ------------------------------ CDP plumbing ------------------------------ */
function cdpClient(endpoint) {
  const ws = new WebSocket(endpoint); const pending = new Map(); const listeners = new Set(); let id = 0;
  const opened = new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ATTENDED_CDP_SOCKET')), { once: true }); });
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(String(ev.data)); } catch { return; }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error('ATTENDED_CDP_FAILED')) : p.res(m.result); return; }
    for (const fn of listeners) fn(m);
  });
  return {
    opened,
    send: (method, params = {}, sessionId) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); }),
    on: (fn) => listeners.add(fn),
    close: () => { try { ws.close(); } catch {} },
  };
}

async function waitEndpoint(profile, child, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error('ATTENDED_BROWSER_EXITED');
    try { const [port, p] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); if (/^\d+$/.test(port)) return `ws://127.0.0.1:${port}${p}`; } catch {}
    await delay(150);
  }
  throw new Error('ATTENDED_BROWSER_START_TIMEOUT');
}

/** In-page helpers (no secret values are ever passed into Runtime.evaluate). */
const PAGE = {
  findButton: (texts) => `(()=>{const T=${JSON.stringify(texts)};const els=[...document.querySelectorAll('button,a,[role=button]')].filter(e=>e.offsetParent!==null);const el=els.find(e=>T.some(t=>(e.innerText||e.textContent||'').trim()===t))||els.find(e=>T.some(t=>(e.innerText||'').includes(t)));if(!el)return false;el.scrollIntoView({block:'center'});el.style.outline='4px solid #f59e0b';el.dataset.ekodiAttended='1';return true})()`,
  clickMarked: `(()=>{const el=document.querySelector('[data-ekodi-attended="1"]');if(!el)return false;el.click();el.removeAttribute('data-ekodi-attended');return true})()`,
  hasText: (texts) => `(()=>{const b=document.body?.innerText||'';return ${JSON.stringify(texts)}.some(t=>b.includes(t))})()`,
  focusedEditable: `(()=>{const a=document.activeElement;return !!a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable)})()`,
  bodyText: `document.body?document.body.innerText:''`,
  githubFillName: (name) => `(()=>{const n=document.querySelector('#secret_name,input[name="secret_name"]');const v=document.querySelector('#secret_value,textarea[name="secret_value"]');if(!n||!v)return false;n.focus();n.value=${JSON.stringify(name)};n.dispatchEvent(new Event('input',{bubbles:true}));v.focus();return true})()`,
  githubSubmit: `(()=>{const f=document.querySelector('#secret_value,textarea[name="secret_value"]')?.form;const b=f&&[...f.querySelectorAll('button[type=submit],input[type=submit]')][0];if(!b)return false;b.click();return true})()`,
};

/* --------------------------------- runner --------------------------------- */
export async function runAttended(recipeId, { ask, say = (m) => console.log(m), audit = makeAudit(), candidates = browserPaths(), spawnImpl = spawn } = {}) {
  const recipe = getRecipe(recipeId);
  let profile = null, child = null, cdp = null, secret = null;
  await audit({ event: 'run.start', recipe: recipeId });
  try {
    let browser = null; for (const c of candidates) { try { await access(c); browser = c; break; } catch {} }
    if (!browser) throw new Error('ATTENDED_BROWSER_NOT_FOUND');
    profile = await mkdtemp(path.join(os.tmpdir(), 'ekodi-attended-'));
    child = spawnImpl(browser, [`--user-data-dir=${profile}`, '--remote-debugging-port=0', '--remote-allow-origins=http://127.0.0.1',
      '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--new-window', 'about:blank'], { stdio: 'ignore' });
    cdp = cdpClient(await waitEndpoint(profile, child)); await cdp.opened;
    const { targetInfos } = await cdp.send('Target.getTargets');
    const page = targetInfos.find((t) => t.type === 'page');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    const s = (m, p) => cdp.send(m, p, sessionId);
    const { frameTree } = await s('Page.getFrameTree'); const mainFrameId = frameTree.frame.id;
    await s('Page.enable'); await s('Runtime.enable');
    await s('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Request' }] });
    cdp.on((m) => {
      if (m.method !== 'Fetch.requestPaused' || m.sessionId !== sessionId) return;
      const ok = navigationAllowed(m.params.request.url, recipe, { mainFrame: m.params.frameId === mainFrameId });
      if (!ok) void audit({ event: 'navigation.blocked', origin: (() => { try { return new URL(m.params.request.url).origin; } catch { return 'invalid'; } })() });
      void s(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
    });
    const evalJs = async (expression) => (await s('Runtime.evaluate', { expression, returnByValue: true })).result?.value;
    const go = async (url) => { await s('Page.navigate', { url }); await delay(2500); };
    const here = async () => new URL(await evalJs('location.href'));

    for (const step of recipe.steps) {
      say(`\n▶ ${step.say}`);
      if (!step.noNavigate) await go(step.url);
      if (step.kind === 'sign-in') {
        say('  (로그인을 기다리는 중… 최대 10분)');
        const end = Date.now() + 600000; let done = false;
        while (Date.now() < end) { const u = await here().catch(() => null); if (u && u.origin === step.readyOrigin && (!step.readyPath || u.pathname.endsWith(step.readyPath))) { done = true; break; } await delay(2000); }
        await audit({ event: 'step', step: step.id, outcome: done ? 'signed-in' : 'timeout' });
        if (!done) throw new Error('ATTENDED_SIGN_IN_TIMEOUT');
        continue;
      }
      if (step.kind === 'click') {
        if (await evalJs(PAGE.hasText(step.doneTexts))) { say('  이미 사용 설정되어 있습니다.'); await audit({ event: 'step', step: step.id, outcome: 'already-done' }); continue; }
        const found = await evalJs(PAGE.findButton(step.texts));
        if (!found) { await ask('  버튼을 찾지 못했습니다. 창에서 직접 눌러 주신 뒤 Enter: '); await audit({ event: 'step', step: step.id, outcome: 'operator-clicked' }); continue; }
        await evalJs(PAGE.clickMarked); await delay(4000);
        if (step.awaitDoneOrigin) {
          say('  Google 화면에서 계정을 고르고 「허용」을 눌러 주세요. 연결 완료를 기다립니다(최대 10분).');
          const end = Date.now() + 600000; let done = false;
          while (Date.now() < end) { const u = await here().catch(() => null); if (u && u.origin === step.awaitDoneOrigin && await evalJs(PAGE.hasText(step.doneTexts)).catch(() => false)) { done = true; break; } await delay(2000); }
          await audit({ event: 'step', step: step.id, outcome: done ? 'connected' : 'timeout' });
          if (!done) throw new Error('ATTENDED_CONNECT_TIMEOUT');
          continue;
        }
        await audit({ event: 'step', step: step.id, outcome: 'clicked' });
      } else if (step.kind === 'insert-text') {
        await evalJs(PAGE.findButton(step.highlight));
        const skip = (await ask(`  안내대로 입력 칸을 클릭해 두셨으면 Enter${step.optional ? ' (건너뛰려면 n 입력 후 Enter)' : ''}: `)).trim().toLowerCase();
        if (step.optional && skip === 'n') { await audit({ event: 'step', step: step.id, outcome: 'skipped' }); continue; }
        if (!(await evalJs(PAGE.focusedEditable))) { await ask('  입력 칸이 선택되지 않았습니다. 칸을 클릭한 뒤 Enter: '); }
        if (!(await evalJs(PAGE.focusedEditable))) throw new Error('ATTENDED_NO_FOCUSED_FIELD');
        await s('Input.insertText', { text: step.text });
        await ask('  입력했습니다. 창에서 「저장」을 누르신 뒤 Enter: ');
        await audit({ event: 'step', step: step.id, outcome: 'inserted' });
      } else if (step.kind === 'capture-secret') {
        const found = await evalJs(PAGE.findButton(step.texts));
        if (found) await evalJs(PAGE.clickMarked); else await ask('  「보안 비밀번호 추가」를 창에서 직접 눌러 주신 뒤 Enter: ');
        for (let i = 0; i < 15 && !secret; i++) { await delay(1000); secret = extractClientSecret(await evalJs(PAGE.bodyText)); }
        await audit({ event: 'step', step: step.id, outcome: secret ? 'captured-in-memory' : 'not-found' });
        if (!secret) throw new Error('ATTENDED_SECRET_NOT_FOUND');
        say('  새 보안 비밀번호를 메모리에만 보관했습니다(화면·로그에 남기지 않음). 창의 대화상자는 닫으셔도 됩니다.');
      } else if (step.kind === 'store-secret') {
        if (!secret) throw new Error('ATTENDED_NO_SECRET_TO_STORE');
        if (!(await evalJs(PAGE.githubFillName(recipe.secretDestination.name)))) throw new Error('ATTENDED_GITHUB_FORM_NOT_FOUND');
        await s('Input.insertText', { text: secret });
        if (!(await evalJs(PAGE.githubSubmit))) throw new Error('ATTENDED_GITHUB_SUBMIT_NOT_FOUND');
        await delay(4000);
        const ok = (await here()).pathname.endsWith('/settings/secrets/actions') && (await evalJs(PAGE.hasText([recipe.secretDestination.name])));
        secret = null;
        await audit({ event: 'step', step: step.id, outcome: ok ? 'stored' : 'unverified' });
        if (!ok) throw new Error('ATTENDED_GITHUB_SECRET_UNVERIFIED');
        say(`  GitHub 비밀값 ${recipe.secretDestination.name} 저장을 확인했습니다.`);
      }
    }
    await audit({ event: 'run.complete', recipe: recipeId });
    say('\n✅ 모든 단계를 마쳤습니다. 이제 Claude에게 "넣었어"라고 알려 주세요.');
    return { ok: true };
  } catch (error) {
    await audit({ event: 'run.failed', recipe: recipeId, code: String(error?.message || 'ATTENDED_FAILED').slice(0, 80) });
    say(`\n⛔ 중단: ${redact(String(error?.message || error))}`);
    return { ok: false, code: redact(String(error?.message || error)) };
  } finally {
    secret = null;
    try { cdp?.close(); } catch {}
    try { child?.kill(); } catch {}
    if (profile) { await delay(800); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
    await audit({ event: 'profile.deleted' });
  }
}

async function main(argv = process.argv.slice(2)) {
  const recipeId = argv[argv.indexOf('--recipe') + 1] || '';
  const recipe = getRecipe(recipeId);
  console.log(renderPlan(recipe));
  if (argv.includes('--plan')) return;
  assertOperatorStart();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const go = (await rl.question('\n위 작업 전체를 한 번에 승인하고 시작할까요? 에코디 전용 새 브라우저 창이 열리며, 단계별로 다시 묻지 않습니다. 중단하려면 창이나 이 화면을 닫으세요. (y/n) ')).trim().toLowerCase();
    if (go !== 'y') { console.log('취소했습니다.'); return; }
    const r = await runAttended(recipeId, { ask: (q) => rl.question(q) });
    process.exitCode = r.ok ? 0 : 1;
  } finally { rl.close(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error('⛔', redact(String(e?.message || e))); process.exitCode = 1; });
