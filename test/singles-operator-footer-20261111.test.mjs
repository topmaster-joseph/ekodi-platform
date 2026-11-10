import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSinglesSurface } from '../singles-surface.js';
const env={ASSETS:{fetch:async()=>new Response('x')}};
for (const path of ['/singles','/singles/terms','/singles/privacy']) {
  test(`동행 하단 사업자 정보 ${path}`, async () => {
    const res = await routeSinglesSurface(new Request('https://ekodi.kr'+path), env);
    const html = await res.text();
    assert.equal(res.status, 200);
    for (const s of ['에코디비즈','대표 정찬균','213-13-01959','2023-전남무안-0153','010-3501-8542','/singles/terms#refund','data-singles-operator'])
      assert.ok(html.includes(s), `${path}: ${s}`);
  });
}
test('약관 제6조에 환불 앵커', async () => {
  const html = await (await routeSinglesSurface(new Request('https://ekodi.kr/singles/terms'), env)).text();
  assert.match(html, /id="refund"><h2>제6조/);
});
