import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const [css,app,gates]=await Promise.all([read('sites/ekodi-singles/public/styles.css'),read('sites/ekodi-singles/public/app.js'),read('docs/EKODI-SINGLES-LAUNCH-GATES.md')]);
test('member area carries the warm premium tone, scoped to inner pages only',()=>{
 assert.match(css,/\.romantic-inner\{--rose:#b9796c/);
 assert.match(css,/\.romantic-inner \.member-card,\.romantic-inner \.paywall\{/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.romantic-inner \.primary/);
 assert.doesNotMatch(css,/@import|url\(https?:/,'no external fonts or images (CSP self only)');
});
test('membership card is readable text, not decoration only, and states the remaining days',()=>{
 assert.match(app,/function membershipCard\(expires\)/);
 assert.match(app,/setAttribute\('aria-label','동행 구독 상태'\)/);
 assert.match(app,/'까지 · 남은 '\+left\+'일'/);
 assert.match(css,/\.romantic-inner \.member-card \.membership-card p\{margin:0;color:#fffaf6/);
});
test('operator refund queue shows summary tiles',()=>{
 assert.match(app,/statTiles\(\[\['환불할 건',d\.pending\+'건'\],\['환불 합계',money\(d\.pending_krw\|\|0\)\],\['처리 완료',done\+'건'\]\]\)/);
});
test('canary opening procedure is written and keeps the owner as the decider',()=>{
 assert.match(gates,/## 공개 개통 카나리 절차\(C7/);
 assert.match(gates,/SINGLES_PUBLIC_LAUNCH_ENABLED=true` \| 소유자 최종 결정/);
 assert.match(gates,/\| G7 \| 적립금 환불 처리 화면 \| ✅ 해당 없음/);
});
