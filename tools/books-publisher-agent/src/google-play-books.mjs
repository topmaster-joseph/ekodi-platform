const PARTNER_CENTER = 'https://play.google.com/books/publish/';

function rx(text) {
  return new RegExp(String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

async function firstVisible(locators, timeout = 1800) {
  for (const locator of locators) {
    try {
      if (await locator.first().isVisible({ timeout })) return locator.first();
    } catch {}
  }
  return null;
}

async function textLocator(page, names, roles = ['button', 'link', 'tab', 'menuitem']) {
  const locators = [];
  for (const name of names) {
    for (const role of roles) locators.push(page.getByRole(role, { name: rx(name) }));
    locators.push(page.getByText(rx(name), { exact: false }));
  }
  return firstVisible(locators);
}

async function clickText(page, names, audit, event, { required = true } = {}) {
  const locator = await textLocator(page, names);
  if (!locator) {
    audit(event, { status: required ? 'blocked' : 'skipped', reason: `UI text not found: ${names.join(' / ')}` });
    if (required) throw new Error(`Google Play Books UI changed or action unavailable: ${names.join(' / ')}`);
    return false;
  }
  await locator.click();
  audit(event, { status: 'ok' });
  return true;
}

async function fieldByLabel(page, names) {
  const locators = [];
  for (const name of names) {
    locators.push(page.getByLabel(rx(name)));
    locators.push(page.locator(`input[aria-label*="${name}" i], textarea[aria-label*="${name}" i]`));
  }
  return firstVisible(locators, 1200);
}

async function fillField(page, names, value, audit, event, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const locator = await fieldByLabel(page, names);
  if (!locator) {
    audit(event, { status: required ? 'blocked' : 'skipped', reason: `Field not found: ${names.join(' / ')}` });
    if (required) throw new Error(`Required Google Play Books field not found: ${names.join(' / ')}`);
    return false;
  }
  await locator.fill(String(value));
  audit(event, { status: 'ok' });
  return true;
}

async function selectField(page, names, value, audit, event) {
  const locator = await fieldByLabel(page, names);
  if (!locator) {
    audit(event, { status: 'skipped', reason: `Select not found: ${names.join(' / ')}` });
    return false;
  }
  try {
    await locator.selectOption({ label: String(value) });
  } catch {
    try { await locator.selectOption(String(value)); }
    catch {
      audit(event, { status: 'skipped', reason: `Could not select ${value}` });
      return false;
    }
  }
  audit(event, { status: 'ok' });
  return true;
}

async function waitForPartnerCenter(page, audit) {
  await page.goto(PARTNER_CENTER, { waitUntil: 'domcontentloaded', timeout: 60000 });
  audit('google.open_partner_center', { status: 'ok', url: page.url() });

  const ready = async () => Boolean(await textLocator(page, ['Book Catalog', '도서 카탈로그'], ['link', 'button', 'menuitem']));
  if (await ready()) return;

  console.log('\nGoogle 로그인이 필요합니다. 열린 자동화 전용 Chrome 창에서 로그인과 2단계 인증을 완료하세요.');
  console.log('비밀번호와 인증코드는 EKODI 에이전트가 저장하거나 전송하지 않습니다.\n');
  audit('google.wait_for_manual_auth', { status: 'waiting' });

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1500);
    if (await ready()) {
      audit('google.wait_for_manual_auth', { status: 'ok' });
      return;
    }
  }
  audit('google.wait_for_manual_auth', { status: 'blocked', reason: '10 minute timeout' });
  throw new Error('Google Partner Center login was not completed within 10 minutes.');
}

async function openExistingBook(page, book, audit) {
  const ggkey = String(book.bookId?.ggkey || '').trim();
  if (!ggkey) return false;

  await clickText(page, ['Book Catalog', '도서 카탈로그'], audit, 'google.catalog.open');
  await page.waitForTimeout(700);

  const search = await firstVisible([
    page.getByLabel(rx('Search')),
    page.getByLabel(rx('검색')),
    page.getByPlaceholder(rx('Search')),
    page.getByPlaceholder(rx('검색')),
    page.locator('input[type="search"]'),
  ], 1200);

  if (search) {
    await search.fill(ggkey);
    await page.waitForTimeout(900);
    audit('google.catalog.search_existing_id', { status: 'ok', ggkey });
  } else {
    audit('google.catalog.search_existing_id', { status: 'needs_review', reason: 'Catalog search field not found', ggkey });
  }

  const existing = await firstVisible([
    page.locator(`a[href*="${ggkey}"]`),
    page.getByText(rx(ggkey), { exact: false }),
  ], 2500);

  if (!existing) {
    audit('google.catalog.existing_book', {
      status: 'blocked',
      ggkey,
      title: book.title,
      reason: 'Existing Google book ID not found in the current Partner Center account; duplicate creation refused',
    });
    throw new Error(`기존 Google 도서 ID ${ggkey}를 현재 파트너 계정에서 찾지 못했습니다. 중복 도서 생성을 막기 위해 새 GGKEY 발급을 중단합니다.`);
  }

  await existing.click();
  await page.waitForTimeout(900);
  audit('google.catalog.existing_book', { status: 'ok', ggkey, title: book.title });
  return true;
}

async function addBook(page, book, audit) {
  await clickText(page, ['Book Catalog', '도서 카탈로그'], audit, 'google.catalog.open');
  await page.waitForTimeout(600);
  await clickText(page, ['Add Book', 'Add book', '도서 추가'], audit, 'google.catalog.add_book');
  await page.waitForTimeout(600);
  await clickText(page, ['Sell ebook on Google Play', 'Sell eBook on Google Play', 'Google Play에서 전자책 판매'], audit, 'google.book.sell_ebook', { required: false });

  if (book.bookId.mode === 'ggkey') {
    await clickText(page, ['Get a Google book ID', 'Google book ID', 'Google 도서 ID'], audit, 'google.book.ggkey');
  } else {
    const filled = await fillField(page, ['ISBN', 'ISBN or EAN', 'ISBN 또는 EAN'], book.bookId.isbn, audit, 'google.book.isbn');
    if (!filled) throw new Error('Could not locate the ISBN field.');
  }
  await clickText(page, ['Save & Continue', 'Save and continue', '저장하고 계속'], audit, 'google.book.save_id');
  await page.waitForTimeout(900);
}

async function fillMetadata(page, book, audit) {
  await clickText(page, ['Book Info', 'Book info', '도서 정보'], audit, 'google.metadata.open', { required: false });
  await fillField(page, ['Title', '제목'], book.title, audit, 'google.metadata.title', { required: true });
  await fillField(page, ['Subtitle', '부제'], book.subtitle, audit, 'google.metadata.subtitle');
  await fillField(page, ['Description', '설명'], book.description, audit, 'google.metadata.description');
  await fillField(page, ['Publisher', '출판사'], book.publisher, audit, 'google.metadata.publisher');
  await fillField(page, ['Publication date', 'Publication Date', '발행일'], book.publicationDate, audit, 'google.metadata.publication_date');
  await selectField(page, ['Language', '언어'], book.language, audit, 'google.metadata.language');

  const contributors = await clickText(page, ['Contributors', '기여자'], audit, 'google.metadata.contributors', { required: false });
  if (contributors) {
    const add = await clickText(page, ['Add contributor', 'Add Contributor', '기여자 추가'], audit, 'google.metadata.add_contributor', { required: false });
    if (add) {
      await fillField(page, ['Name', 'Contributor name', '이름'], book.author, audit, 'google.metadata.author');
      await selectField(page, ['Role', '역할'], 'Author', audit, 'google.metadata.author_role');
      await clickText(page, ['Save', '저장'], audit, 'google.metadata.save_contributor', { required: false });
    }
  }

  await clickText(page, ['Save', '저장'], audit, 'google.metadata.save', { required: false });
}

async function uploadFiles(page, book, audit) {
  await clickText(page, ['Content', 'Content files', '콘텐츠'], audit, 'google.content.open');
  await page.waitForTimeout(700);
  const fileInputs = page.locator('input[type="file"]');
  if (await fileInputs.count()) {
    await fileInputs.first().setInputFiles([book.epubPath, book.coverPath]);
    audit('google.content.upload', { status: 'ok', files: ['epub', 'cover'] });
    return;
  }

  const upload = await textLocator(page, ['Upload a file', 'Upload content', '파일 업로드', '콘텐츠 업로드'], ['button']);
  if (!upload) {
    audit('google.content.upload', { status: 'blocked', reason: 'Upload control not found' });
    throw new Error('Google content upload control was not found.');
  }
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 });
  await upload.click();
  const chooser = await chooserPromise;
  await chooser.setFiles([book.epubPath, book.coverPath]);
  audit('google.content.upload', { status: 'ok', files: ['epub', 'cover'] });
}

async function setPricing(page, book, audit) {
  await clickText(page, ['Pricing', '가격'], audit, 'google.pricing.open');
  await page.waitForTimeout(600);
  await clickText(page, ['Add a price', '가격 추가'], audit, 'google.pricing.add', { required: false });

  const currencySelected = await selectField(page, ['Currency', '통화'], book.currency, audit, 'google.pricing.currency');
  const priceFilled = await fillField(page, ['Price', '가격'], book.price, audit, 'google.pricing.price');
  const territorySelected = await selectField(page, ['Countries/regions', 'Territory', '지역', '국가/지역'], book.territory === 'WORLD' ? 'Worldwide' : book.territory, audit, 'google.pricing.territory');

  if (!priceFilled) {
    const numberInputs = page.locator('input[type="number"]');
    if (await numberInputs.count()) {
      await numberInputs.first().fill(String(book.price));
      audit('google.pricing.price_fallback', { status: 'ok' });
    } else {
      audit('google.pricing.price', { status: 'blocked', reason: 'Price field not found' });
      throw new Error('Google price field was not found.');
    }
  }
  if (!currencySelected) audit('google.pricing.currency_review', { status: 'needs_review', expected: book.currency });
  if (!territorySelected) audit('google.pricing.territory_review', { status: 'needs_review', expected: book.territory });
  await clickText(page, ['Save & Continue', 'Save and continue', '저장하고 계속', 'Save', '저장'], audit, 'google.pricing.save', { required: false });
}

async function reviewAndMaybePublish(page, book, audit, publishApproval) {
  await clickText(page, ['Review', '검토'], audit, 'google.review.open');
  audit('google.review.ready', { status: 'ok', title: book.title });

  if (!publishApproval) {
    console.log('\n등록 정보와 파일 업로드를 완료했습니다. Review 화면에서 멈췄습니다.');
    console.log('실제 공개까지 자동 실행하려면 제목 승인과 함께 --publish 옵션을 사용하세요.');
    audit('google.publish', { status: 'not_requested' });
    return;
  }
  if (publishApproval !== book.title) throw new Error('Publish approval title does not exactly match the manifest title.');
  await clickText(page, ['Publish', '게시', '출판'], audit, 'google.publish');
  audit('google.publish.confirmed', { status: 'ok', title: book.title });
}

export async function publishGooglePlayBook({ chromium, book, profileDir, audit, publishApproval = '' }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    acceptDownloads: true,
  });
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  try {
    await waitForPartnerCenter(page, audit);
    if (book.bookId.mode === 'ggkey' && book.bookId.ggkey) {
      await openExistingBook(page, book, audit);
    } else {
      await addBook(page, book, audit);
    }
    await fillMetadata(page, book, audit);
    await uploadFiles(page, book, audit);
    await setPricing(page, book, audit);
    await reviewAndMaybePublish(page, book, audit, publishApproval);
    return { status: publishApproval ? 'published' : 'review_ready', url: page.url() };
  } catch (error) {
    audit('google.publisher.failed', { status: 'blocked', message: error.message, url: page.url() });
    throw error;
  } finally {
    if (!publishApproval) console.log(`\n자동화 전용 브라우저 프로필: ${profileDir}`);
    await context.close();
  }
}

export { PARTNER_CENTER };
