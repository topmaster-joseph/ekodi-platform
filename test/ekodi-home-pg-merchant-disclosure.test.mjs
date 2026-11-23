import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [home, shared] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../config/user-footer.js', import.meta.url), 'utf8'),
]);

test('EKODI root exposes the registered business operator visibly for PG website precheck', () => {
  const footer = home.match(/<footer class="ekodi-home-merchant-disclosure"[^>]*>[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer, 'a literal footer must exist in root HTML without JavaScript initialization');
  assert.ok(home.indexOf('<footer class="ekodi-home-merchant-disclosure"') > home.indexOf('</main>'));
  assert.match(footer, /data-ekodi-service-footer="true"/);
  const fields = [
    ['상호', '에코디비즈', "name:'에코디비즈'"],
    ['대표자명', '정찬균', "representative:'정찬균'"],
    ['사업자등록번호', '213-13-01959', "businessRegistrationNumber:'213-13-01959'"],
    ['통신판매업신고번호', '2023-전남무안-0153', "commerceRegistrationNumber:'2023-전남무안-0153'"],
    ['사업장 주소', '전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층', "address:'전남광주통합특별시 무안군 청계면 백련동1길 17-4, 건물 1층'"],
    ['고객 문의 전화', '010-3501-8542', "phone:'010-3501-8542'"],
    ['이메일', 'ekodibiz@gmail.com', "email:'ekodibiz@gmail.com'"],
  ];
  for (const [label, value, sharedRecord] of fields) {
    assert.ok(shared.includes(sharedRecord), 'root operator must match canonical public footer: ' + label);
    assert.ok(footer.includes('<dt>' + label + '</dt>'), 'visible business label missing: ' + label);
    assert.ok(footer.includes(value), 'visible public business value missing: ' + label);
  }
  assert.doesNotMatch(footer, /061-453-8295/, 'a customer-operated store phone must not become EKODIBIZ legal contact');
});

test('EKODI PG precheck legal pages are linked without client-side rendering', () => {
  const footer = home.slice(home.indexOf('<footer class="ekodi-home-merchant-disclosure"'));
  for (const link of ['https://ekodi.kr/terms', 'https://ekodi.kr/privacy', 'https://ekodi.kr/ekodibiz/refund']) {
    assert.ok(footer.includes('href="' + link + '"'), 'missing public policy ' + link);
  }
  assert.match(footer, /href="mailto:ekodibiz@gmail\.com"/);
  assert.match(footer, /href="tel:\+821035018542"/);
  assert.match(footer, /개별 서비스·기관·단체의 운영 주체가 다른 경우/);
  assert.match(home, /@media\(max-width:760px\).*\.ekodi-home-merchant-disclosure/s);
  assert.match(home, /@media\(max-width:410px\).*\.ekodi-home-merchant-disclosure/s);
  assert.equal((home.match(/<footer class="ekodi-home-merchant-disclosure"/g)||[]).length, 1);
});
