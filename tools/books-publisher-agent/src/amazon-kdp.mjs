const KDP_BOOKSHELF = 'https://kdp.amazon.com/en_US/bookshelf';

function rx(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function firstVisible(locators, timeout = 1500) {
  for (const locator of locators) {
    try { if (await locator.first().isVisible({ timeout })) return locator.first(); } catch {}
  }
  return null;
}

async function findText(page, names, roles = ['button', 'link', 'heading']) {
  const locators = [];
  for (const name of names) {
    for (const role of roles) locators.push(page.getByRole(role, { name: rx(name) }));
    locators.push(page.getByText(rx(name), { exact: false }));
  }
  return firstVisible(locators);
}

async function clickText(page, names, audit, event, { required = true } = {}) {
  const el = await findText(page, names);
  if (!el) {
    audit(event, { status: required ? 'blocked' : 'skipped', reason: `UI text not found: ${names.join(' / ')}` });
    if (required) throw new Error(`Amazon KDP UI changed or action unavailable: ${names.join(' / ')}`);
    return false;
  }
  await el.click();
  audit(event, { status: 'ok' });
  return true;
}

async function fill(page, names, value, audit, event, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const locators = [];
  for (const name of names) {
    locators.push(page.getByLabel(rx(name)));
    locators.push(page.getByPlaceholder(rx(name)));
  }
  const el = await firstVisible(locators);
  if (!el) {
    audit(event, { status: required ? 'blocked' : 'skipped', reason: `Field not found: ${names.join(' / ')}` });
    if (required) throw new Error(`Required Amazon KDP field not found: ${names.join(' / ')}`);
    return false;
  }
  await el.fill(String(value));
  audit(event, { status: 'ok' });
  return true;
}

async function waitForBookshelf(page, audit) {
  await page.goto(KDP_BOOKSHELF, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ready = async () => Boolean(await findText(page, ['Bookshelf', 'Create', 'Your Books'], ['heading', 'button', 'link']));
  if (await ready()) return;
  audit('kdp.wait_for_manual_auth', { status: 'waiting' });
  console.log('\nAmazon KDP 로그인이 필요합니다. 자동화 전용 Chrome 창에서 로그인 및 2단계 인증을 완료하세요.');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (await ready()) {
      audit('kdp.wait_for_manual_auth', { status: 'ok' });
      return;
    }
  }
  throw new Error('Amazon KDP login was not completed within 10 minutes.');
}

function splitAuthor(author) {
  const parts = String(author).trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
}

async function prepareTitleDetails(page, book, audit) {
  const createClicked = await clickText(page, ['Create'], audit, 'kdp.create.open', { required: false });
  if (createClicked) await page.waitForTimeout(500);
  await clickText(page, ['Kindle eBook', 'eBook'], audit, 'kdp.create.ebook');
  await page.waitForTimeout(700);

  await fill(page, ['Book title', 'Title'], book.title, audit, 'kdp.metadata.title', { required: true });
  await fill(page, ['Subtitle'], book.subtitle, audit, 'kdp.metadata.subtitle');
  await fill(page, ['Description'], book.description, audit, 'kdp.metadata.description');
  const author = splitAuthor(book.author);
  await fill(page, ['First name'], author.first, audit, 'kdp.metadata.author_first');
  await fill(page, ['Last name'], author.last, audit, 'kdp.metadata.author_last');

  // KDP requires publisher declarations about publishing rights and AI-generated content.
  // The agent deliberately does not invent or silently attest legal/disclosure answers.
  audit('kdp.declarations', {
    status: 'needs_review',
    known: {
      aiGeneratedTranslation: Boolean(book.kdp?.aiGeneratedTranslation),
    },
    reason: 'Publishing-rights and AI content declarations require an explicit manifest declaration before Save & Continue.',
  });
  console.log('\nKDP 도서정보를 입력했습니다. 권리/AI 공개 선언 단계에서 안전하게 멈췄습니다.');
  console.log('영문판 메타데이터에는 AI-generated translation 사실이 기록되어 있습니다.');
  return { status: 'declarations_required', url: page.url() };
}

export async function publishAmazonKdpBook({ chromium, book, profileDir, audit }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome', headless: false, viewport: null, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    await waitForBookshelf(page, audit);
    return await prepareTitleDetails(page, book, audit);
  } catch (error) {
    audit('kdp.publisher.failed', { status: 'blocked', message: error.message, url: page.url() });
    throw error;
  } finally {
    console.log(`\nKDP 자동화 전용 브라우저 프로필: ${profileDir}`);
    await context.close();
  }
}

export { KDP_BOOKSHELF };
