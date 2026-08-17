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

async function waitForAdmin(page, audit) {
  await page.goto(UPAPER_ADMIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ready = async () => Boolean(await findText(page, ['콘텐츠관리', '회원관리', '매출관리', '정산관리']));
  if (await ready()) return;

  audit('upaper.wait_for_manual_auth_or_seller', { status: 'waiting' });
  console.log('\n유페이퍼 판매자 로그인이 필요합니다. 자동화 전용 Chrome 창에서 로그인하세요.');
  console.log('판매자 전환이 아직 안 된 계정이면 유페이퍼의 판매자 등록/정산정보 설정이 먼저 필요합니다.');
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (await ready()) {
      audit('upaper.wait_for_manual_auth_or_seller', { status: 'ok' });
      return;
    }
  }
  throw new Error('유페이퍼 판매자 관리자 로그인이 10분 안에 완료되지 않았습니다.');
}

async function prepareContent(page, book, audit) {
  await clickText(page, ['콘텐츠관리'], audit, 'upaper.content.open');
  await page.waitForTimeout(500);
  const added = await clickText(page, ['신규등록', '신규 콘텐츠', '콘텐츠등록', '전자책 등록'], audit, 'upaper.content.add', { required: false });
  if (!added) {
    audit('upaper.content.add', { status: 'blocked', reason: '신규 콘텐츠 등록 버튼을 찾지 못함' });
    throw new Error('유페이퍼 신규 콘텐츠 등록 화면을 찾지 못했습니다.');
  }
  await page.waitForTimeout(500);

  await fill(page, ['도서명', '제목', '콘텐츠명'], book.title, audit, 'upaper.metadata.title', { required: true });
  await fill(page, ['부제', '부제목'], book.subtitle, audit, 'upaper.metadata.subtitle');
  await fill(page, ['저자', '작가'], book.author, audit, 'upaper.metadata.author');
  await fill(page, ['출판사'], book.publisher, audit, 'upaper.metadata.publisher');
  await fill(page, ['책소개', '도서소개', '소개'], book.description, audit, 'upaper.metadata.description');
  await fill(page, ['판매가', '가격'], book.price, audit, 'upaper.metadata.price');

  const fileInputs = page.locator('input[type="file"]');
  const count = await fileInputs.count();
  if (count > 0) {
    try {
      await fileInputs.first().setInputFiles(book.epubPath);
      if (count > 1) await fileInputs.nth(1).setInputFiles(book.coverPath);
      audit('upaper.content.upload', { status: 'ok', epub: true, cover: count > 1 });
    } catch (error) {
      audit('upaper.content.upload', { status: 'needs_review', message: error.message });
    }
  } else {
    audit('upaper.content.upload', { status: 'needs_review', reason: '업로드 입력란을 자동 식별하지 못함' });
  }

  // 유페이퍼는 판매 신청 뒤 검수와 ISBN/UCI 신청 절차가 이어질 수 있다.
  // 자동화는 현재 최종 판매신청을 누르지 않고 등록 초안 단계에서 멈춘다.
  audit('upaper.sale_application', { status: 'not_submitted', reason: '판매자/정산/식별번호 상태를 확인한 뒤 제출해야 함' });
  console.log('\n유페이퍼 콘텐츠 등록 초안을 준비했습니다. 판매신청 직전에서 멈췄습니다.');
  return { status: 'draft_ready', url: page.url() };
}

export async function publishUpaperBook({ chromium, book, profileDir, audit }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome', headless: false, viewport: null, acceptDownloads: true,
  });
  const page = context.pages()[0] || await context.newPage();
  try {
    await waitForAdmin(page, audit);
    return await prepareContent(page, book, audit);
  } catch (error) {
    audit('upaper.publisher.failed', { status: 'blocked', message: error.message, url: page.url() });
    throw error;
  } finally {
    console.log(`\n유페이퍼 자동화 전용 브라우저 프로필: ${profileDir}`);
    await context.close();
  }
}

export { UPAPER_ADMIN };
