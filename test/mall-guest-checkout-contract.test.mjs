import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const checkout=read('../sites/ekodi-mall/assets/mall-checkout.js');
const product=read('../sites/ekodi-mall/assets/public-product.js');
const html=read('../sites/ekodi-mall/assets/shared-product.html');
const api=read('../sites/ekodi-mall/api/worker.js');
const entry=read('../sites/ekodi-mall/api/entry.js');
const platform=read('../sites/ekodi-mall/src/index.template.html');
const config=read('../sites/ekodi-mall/api/wrangler.toml');

test('guest checkout has a clearly labeled public path with no login, only for server-ready direct sales',()=>{
  assert.match(html,/https:\/\/js\.tosspayments\.com\/v2\/standard/);
  assert.ok(html.includes('/assets/mall-checkout.js'));
  assert.ok(checkout.includes('비회원 주문 · 카드결제'));
  assert.ok(checkout.includes('비회원으로 카드결제'));
  assert.ok(checkout.includes('회원가입이나 로그인 없이 주문할 수 있습니다.'));
  assert.ok(checkout.includes('checkout-guest-policies'));
  assert.ok(checkout.includes('pages/privacy/'));
  assert.ok(checkout.includes('pages/returns/'));
  assert.ok(checkout.includes("if (!host || !ctx?.quote?.checkoutReady) return null;"));
  assert.ok(product.includes('if (quote?.checkoutReady && window.EkodiMallCheckout)'));
  assert.ok(product.includes('비회원 카드결제 가능'));
  assert.ok(product.includes('실제 판매 승인·가격·재고·결제 설정 확인 후'));
  assert.ok(platform.includes('회원가입 없이 비회원 카드결제를 이용할 수 있습니다.'));
});
test('Toss V2 guest checkout remains server priced and safeguards its public return',()=>{
  assert.ok(checkout.includes("customerKey: co.customerKey || 'ANONYMOUS'"));
  assert.ok(checkout.includes("widgets.setAmount({ currency: 'KRW', value: order.amount })"));
  assert.ok(checkout.includes("method: 'CARD', amount: { currency: 'KRW', value: order.amount }"));
  assert.ok(checkout.includes('pendingGuestOrder'));
  assert.ok(checkout.includes("if (dialog.open || dialog.hasAttribute('open')) return;"));
  assert.ok(checkout.includes('Date.parse(pendingGuestOrder.order?.expiresAt)'));
  assert.ok(checkout.includes("co.paymentMode === 'test'"));
  assert.ok(checkout.includes('api}/api/public/payments/confirm'));
  assert.ok(checkout.includes("history.replaceState(null, '', clean.pathname + clean.search)"));
  assert.ok(api.includes('const result = await buildOrderQuote(env, input)'));
  assert.ok(api.includes('const id = orderId()'));
  assert.ok(api.includes('const guard = assessOrderForConfirmation(order, amount)'));
  assert.ok(api.includes('mall-confirm-'+'$'+'{order.id}'));
});
test('guest routes stay before seller authentication and marketplace settlement cannot activate via UI',()=>{
  const publicOrders=api.indexOf("url.pathname === '/api/public/orders'");
  const sellerAuth=api.indexOf('const user = await authenticate(request, env);',publicOrders);
  assert.ok(publicOrders>0&&sellerAuth>publicOrders);
  assert.ok(entry.includes('withMerchantKeys(rawEnv'));
  assert.ok(config.includes('EKODIPAY_PROFILE = "mall"'));
  assert.ok(config.includes('SOURCING_AUTO_ORDER_ENABLED = "false"'));
  assert.ok(config.includes('BUYER_PII_RELEASE_ENABLED = "false"'));
  assert.doesNotMatch(checkout, /Authorization\s*:\s*['"]Bearer|TOSS_SECRET_KEY|sellerVerificationApproved\s*=\s*true/);
});
