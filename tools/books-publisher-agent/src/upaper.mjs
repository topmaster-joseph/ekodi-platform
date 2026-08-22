const UPAPER_CHAPTERS = 'https://chapters.upaper.kr/';
const UPAPER_ADMIN = 'https://admin.upaper.kr/';

function rx(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function firstVisible(locators, timeout = 1500) {
  for (const locator of locators) {
    try { if (await locator.first().isVisible({ timeout })) return locator.first(); } catch {}
  }
  return null;
}

async function findText(page, names, roles = ['button', 'link', 'menuitem', 'heading']) {
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
    if (required) throw new Error(`유페이퍼 화면이 변경되었거나 작업을 찾을 수 없습니다: ${names.join(' / ')}`);
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
    if (required) throw new Error(`유페이퍼 필수 입력란을 찾지 못했습니다: ${names.join(' / ')}`);
    return false;
  }
  await el.fill(String(value));
  audit(event, { status: 'ok' });
  return true;
}

async function uploadFile(page, names, filePath, audit, event, acceptPattern) {
  if (!filePath) return false;
  const labelled = [];
  for (const name of names) labelled.push(page.getByLabel(rx(name)));
  let input = await firstVisible(labelled, 500);
  if (!input) {
    const candidates = page.locator('input[type="file"]');
    const count = await candidates.count();
    for (let i = 0; i < count; i += 1) {
      const candidate = candidates.nth(i);
      const accept = String(await candidate.getAttribute('accept') || '');
      if (acceptPattern.test(accept)) { input = candidate; break; }
    }
  }
  if (!input) {
    audit(event, { status: 'needs_review', reason: `업로드 입력란을 식별하지 못함: ${names.join(' / ')}` });
    return false;
  }
  try {
    await input.setInputFiles(filePath);
    audit(event, { status: 'ok' });
    return true;
  } catch (error) {
    audit(event, { status: 'needs_review', message: error.message });
    return false;
  }
}

async function waitForSellerSession(page, audit) {
  await page.goto(UPAPER_CHAPTERS, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const chaptersReady = async () => Boolean(await findText(page, ['CHAPTERs', '새 프로젝트', '프로젝트', '내 프로젝트']));
  if (await chaptersReady()) {
    audit('upaper.chapters.session', { status: 'ok' });
    return 'chapters';
  }

  audit('upaper.wait_for_manual_auth_or_seller', { status: 'waiting' });
  console.log('\n유페이퍼 로그인이 필요합니다. 자동화 전용 Chrome 창에서 로그인하세요.');
  console.log('판매자 전환이 아직 안 된 계정이면 판매자 등록의 필수 정보 입력이 먼저 필요합니다.');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (await chaptersReady()) {
      audit('upaper.wait_for_manual_auth_or_seller', { status: 'ok', surface: 'chapters' });
      return 'chapters';
    }
  }

  // CHAPTERs UI를 판별할 수 없는 경우에만 기존 판매자 관리자를 호환 경로로 확인한다.
  await page.goto(UPAPER_ADMIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const legacyReady = Boolean(await findText(page, ['설정', '콘텐츠등록', '콘텐츠관리', '회원관리', '매출관리', '정산관리']));
  if (legacyReady) {
    audit('upaper.wait_for_manual_auth_or_seller', { status: 'ok', surface: 'legacy_admin' });
    return 'legacy';
  }
  throw new Error('유페이퍼 로그인 또는 판매자 등록 상태를 확인하지 못했습니다.');
}

async function openChaptersRegistration(page, audit) {
  if (!page.url().startsWith(UPAPER_CHAPTERS)) await page.goto(UPAPER_CHAPTERS, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const added = await clickText(page, ['새 프로젝트', '프로젝트 만들기', '새 책', '도서등록'], audit, 'upaper.chapters.project.add', { required: false });
  if (!added) {
    audit('upaper.chapters.project.add', { status: 'needs_review', reason: '새 프로젝트 버튼을 찾지 못해 현재 화면을 사용' });
  } else {
    await page.waitForTimeout(500);
  }
}

async function openLegacyRegistration(page, audit) {
  if (!page.url().startsWith(UPAPER_ADMIN)) await page.goto(UPAPER_ADMIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const settingsOpened = await clickText(page, ['설정'], audit, 'upaper.settings.open', { required: false });
  if (settingsOpened) await page.waitForTimeout(400);
  let contentOpened = await clickText(page, ['콘텐츠등록'], audit, 'upaper.content_registration.open', { required: false });
  if (!contentOpened) contentOpened = await clickText(page, ['콘텐츠관리'], audit, 'upaper.content_management.open', { required: false });
  if (!contentOpened) throw new Error('유페이퍼 콘텐츠등록 메뉴를 찾지 못했습니다.');
  await page.waitForTimeout(500);
  const editorOpened = await clickText(page, ['유페이퍼 epub웹에디터', '유페이퍼 EPUB 웹에디터', 'EPUB 웹에디터', 'epub웹에디터'], audit, 'upaper.epub_editor.open', { required: false });
  if (editorOpened) await page.waitForTimeout(500);
  const added = await clickText(page, ['도서등록', '신규등록', '신규 콘텐츠', '전자책 등록'], audit, 'upaper.book.add', { required: false });
  if (!added) throw new Error('유페이퍼 도서등록 화면을 찾지 못했습니다.');
  await page.waitForTimeout(500);
}

async function prepareContent(page, book, audit, surface) {
  if (surface === 'chapters') await openChaptersRegistration(page, audit);
  else await openLegacyRegistration(page, audit);

  await fill(page, ['도서명', '책제목', '제목', '콘텐츠명'], book.title, audit, 'upaper.metadata.title', { required: true });
  await fill(page, ['부제', '부제목'], book.subtitle, audit, 'upaper.metadata.subtitle');
  await fill(page, ['저자', '저자명', '작가'], book.author, audit, 'upaper.metadata.author');
  await fill(page, ['출판사', '출판사명'], book.publisher, audit, 'upaper.metadata.publisher');
  await fill(page, ['책소개', '도서소개', '소개'], book.description, audit, 'upaper.metadata.description');
  await fill(page, ['판매가', '가격'], book.price, audit, 'upaper.metadata.price');
  await fill(page, ['해시태그', '키워드'], book.keywords, audit, 'upaper.metadata.keywords');

  await uploadFile(page, ['EPUB', '전자책 파일', '원고 파일'], book.epubPath, audit, 'upaper.content.epub_upload', /epub|application\/epub/i);
  await uploadFile(page, ['표지', '표지 이미지', '커버'], book.coverPath, audit, 'upaper.content.cover_upload', /image|png|jpe?g/i);

  audit('upaper.isbn_ucash', {
    status: 'needs_review',
    reason: 'ISBN 발급 또는 U캐쉬 결제가 필요한 경우 금액을 사용자가 확인·승인해야 함',
  });
  audit('upaper.sale_application', { status: 'not_submitted', reason: '최종 판매신청은 사용자가 직접 확인해야 함' });
  console.log('\n유페이퍼 등록 초안을 준비했습니다. 결제 및 최종 판매신청 직전에서 멈췄습니다.');
  return { status: 'draft_ready', surface, url: page.url() };
}

export async function publishUpaperBook({ chromium, book, profileDir, audit }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome', headless: false, viewport: null, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    const surface = await waitForSellerSession(page, audit);
    return await prepareContent(page, book, audit, surface);
  } catch (error) {
    audit('upaper.publisher.failed', { status: 'blocked', message: error.message, url: page.url() });
    throw error;
  } finally {
    console.log(`\n유페이퍼 자동화 전용 브라우저 프로필: ${profileDir}`);
    await context.close();
  }
}

export { UPAPER_ADMIN, UPAPER_CHAPTERS };
