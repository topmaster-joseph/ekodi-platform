import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { validateBuyer, tossKeyBlockers, checkoutConfig, isWidgetClientKey } from './checkout-buyer.js';
import mallApi, { createOrder, recordConfirmedPayment } from './worker.js';
import { pointEstimate, eligibleMember, verifiedRefundPointStatements, memberPointsView } from './member-purchase-points.js';
import { paymentProviderReadiness } from './payment-capabilities.js';

class Stmt { constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; } bind(...a) { this.args = a; return this; } run() { return this.db.prepare(this.sql).run(...this.args); } first() { return this.db.prepare(this.sql).get(...this.args) || null; } all() { return { results: this.db.prepare(this.sql).all(...this.args) }; } }
class DB { constructor() { this.db = new DatabaseSync(':memory:'); } prepare(sql) { return new Stmt(this.db, sql); } async batch(s) { this.db.exec('BEGIN'); try { const r = s.map(x => x.run()); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; } } exec(sql) { this.db.exec(sql); } }
function migrated() {
  const db = new DB();
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of readdirSync(dir).filter(v => v.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(name, dir), 'utf8'));
  const now = new Date().toISOString();
  db.db.prepare(`INSERT INTO seller_profiles (user_id,email,display_name,seller_type,verification_status,direct_sale_status,created_at,updated_at) VALUES ('s1','s@x','EKODIBIZ','business','google_verified','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO stores (id,seller_id,slug,name,contact,status,verification_status,created_at,updated_at) VALUES ('st1','s1','ekodibiz','EKODIBIZ','c','active','verified',?,?)`).run(now, now);
  db.db.prepare(`INSERT INTO products (id,seller_id,store_id,share_code,public_url,seller_display_name,seller_type,sale_type,category,name,price,stock_quantity,contact,status,checkout_ready,created_at,updated_at,published_at)
    VALUES ('p1','s1','st1','SHARE1','https://ekodi.kr/ekodimall/p/SHARE1','EKODIBIZ','business','direct','general','에코디 텀블러',15000,10,'c','published',1,?,?,?)`).run(now, now, now);
  return db;
}
const BUYER = { name: '김구매', phone: '01012345678', email: 'buyer@example.com', postcode: '58556', address1: '전남 무안군 청계면 영산로 1', address2: '101호', memo: '문 앞', privacyConsent: true };
const LIVE_WIDGET = { PAYMENTS_ENABLED: 'true', PAYMENT_PROVIDER: 'toss', TOSS_CLIENT_KEY: 'live_gck_x', TOSS_SECRET_KEY: 'live_gsk_y', MALL_BASE_URL: 'https://ekodi.kr/ekodimall', MALL_TOSS_MERCHANT_ONLY: 'true', MALL_EKODIAN_EMAILS: 's@x' };

test('buyer validation requires recipient, mobile, 5-digit postcode, address and consent', () => {
  const ok = validateBuyer(BUYER);
  assert.equal(ok.ok, true);
  assert.equal(ok.buyer.phone, '010-1234-5678');
  for (const [patch, needle] of [[{ name: 'a' }, '이름'], [{ phone: '02-123-4567' }, '휴대전화'], [{ postcode: '123' }, '우편번호'], [{ address1: '' }, '주소'], [{ email: 'x' }, '이메일'], [{ privacyConsent: false }, '동의']]) {
    const r = validateBuyer({ ...BUYER, ...patch });
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.ok(r.errors.some(e => e.includes(needle)), needle);
  }
  assert.equal(validateBuyer(undefined).ok, false);
});

test('Toss key pairs: widget (gck/gsk) or individual (ck/sk), never mixed or cross-mode', () => {
  assert.deepEqual(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_gck_a', TOSS_SECRET_KEY: 'live_gsk_b' }), []);
  assert.deepEqual(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_ck_a', TOSS_SECRET_KEY: 'live_sk_b' }), []);
  assert.ok(tossKeyBlockers({ TOSS_CLIENT_KEY: 'live_gck_a', TOSS_SECRET_KEY: 'live_sk_b' }).includes('toss-key-type-mismatch'));
  assert.ok(tossKeyBlockers({ TOSS_CLIENT_KEY: 'test_gck_a', TOSS_SECRET_KEY: 'live_gsk_b' }).includes('toss-key-mode-mismatch'));
  assert.ok(tossKeyBlockers({ TOSS_SECRET_KEY: 'live_gsk_b' }).includes('toss-client-key-missing'));
  for(const [client,secret] of [['random-client','random-secret'],['live_gck_valid','wrong-key'],['wrong-key','live_gsk_valid']]){
    const blockers=tossKeyBlockers({TOSS_CLIENT_KEY:client,TOSS_SECRET_KEY:secret});
    assert.ok(blockers.some(x=>x.endsWith('-invalid')), 'malformed nonempty credentials must fail closed');
    assert.equal(paymentProviderReadiness({PAYMENT_PROVIDER:'toss',PAYMENTS_ENABLED:'true',TOSS_CLIENT_KEY:client,TOSS_SECRET_KEY:secret}).liveReady,false);
  }
  assert.deepEqual(tossKeyBlockers({TOSS_CLIENT_KEY:'test_gck_abc',TOSS_SECRET_KEY:'test_gsk_abc'}),[]);
  assert.deepEqual(tossKeyBlockers({TOSS_CLIENT_KEY:'test_ck_abc',TOSS_SECRET_KEY:'test_sk_abc'}),[]);

  assert.equal(paymentProviderReadiness(LIVE_WIDGET).liveReady, true);
  assert.equal(paymentProviderReadiness({ ...LIVE_WIDGET, TOSS_SECRET_KEY: 'live_sk_y' }).liveReady, false);
  assert.equal(isWidgetClientKey('live_gck_x'), true);
  const co = checkoutConfig(LIVE_WIDGET, { id: 'mall_1', shareCode: 'SHARE1' });
  assert.deepEqual({ widget: co.widget, variantKey: co.variantKey, customerKey: co.customerKey }, { widget: true, variantKey: 'qtin', customerKey: 'ANONYMOUS' });
  assert.equal(co.successUrl, 'https://ekodi.kr/ekodimall/p/SHARE1?checkout=success');
  assert.equal(co.failUrl, 'https://ekodi.kr/ekodimall/p/SHARE1?checkout=fail&orderId=mall_1');
  assert.equal(co.loginRequired,false,'guest checkout never requires Google/social login');
  assert.equal(co.paymentMode,'live');
  assert.equal(checkoutConfig({...LIVE_WIDGET,TOSS_CLIENT_KEY:'test_gck_testonly'}, {id:'mall_2',shareCode:'SHARE1'}).paymentMode,'test');

  assert.ok(!JSON.stringify(co).includes('gsk'), 'secret key never reaches the browser');
});

test('direct-sale order stores the recipient and returns widget checkout config; missing buyer is refused', async () => {
  const db = migrated();
  const env = { ...LIVE_WIDGET, DB: db };
  const refused = await createOrder(env, { shareCode: 'SHARE1', quantity: 1 });
  assert.equal(refused.status, 400);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n, 0, 'nothing stored without a recipient');
  const created = await createOrder(env, { shareCode: 'SHARE1', quantity: 2, buyer: BUYER });
  assert.equal(created.status, 201, JSON.stringify(created));
  const order = created.order;
  assert.equal(order.amount, 30000);
  assert.equal(order.checkout.clientKey, 'live_gck_x');
  assert.equal(order.checkout.widget, true);
  assert.equal(order.checkout.successUrl, 'https://ekodi.kr/ekodimall/p/SHARE1?checkout=success');
  assert.equal(order.customerMobilePhone, '01012345678');
  assert.ok(!JSON.stringify(order).includes('live_gsk_y'));
  const row = db.db.prepare('SELECT name, phone, postcode, address1, address2 FROM order_buyers WHERE order_id=?').get(order.id);
  assert.deepEqual({ ...row }, { name: '김구매', phone: '010-1234-5678', postcode: '58556', address1: '전남 무안군 청계면 영산로 1', address2: '101호' });
  const gated = await createOrder({ ...env, PAYMENTS_ENABLED: 'false' }, { shareCode: 'SHARE1', quantity: 1, buyer: BUYER });
  assert.equal(gated.status, 409, 'existing payment gates still apply');
});

test('public nonmember HTTP order route accepts a genuine buyer without Google session and uses only server price', async () => {
  const db = migrated();
  const env = {...LIVE_WIDGET,DB:db};
  const input = {shareCode:'SHARE1',quantity:2,buyer:BUYER,amount:1,price:1,customerKey:'attacker-phone'};
  const request = new Request('https://ekodi.kr/api/public/orders',{
    method:'POST',
    headers:{'content-type':'application/json'}, // explicitly no Authorization or Cookie
    body:JSON.stringify(input),
  });
  const response = await mallApi.fetch(request,env);
  assert.equal(response.status,201,await response.clone().text());
  const payload=await response.json();
  assert.equal(payload.order.amount,30000,'client amount must never override authoritative product price');
  assert.equal(payload.order.checkout.customerKey,'ANONYMOUS');
  assert.equal(payload.order.checkout.loginRequired,false);
  assert.equal(payload.order.checkout.paymentMode,'live');
  assert.ok(!JSON.stringify(payload).includes(LIVE_WIDGET.TOSS_SECRET_KEY));
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,1);
});
test('public nonmember endpoint refuses a sale when merchant payment gating is disabled without reserving inventory',async()=>{
  const db=migrated();
  const request=new Request('https://ekodi.kr/api/public/orders',{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({shareCode:'SHARE1',quantity:1,buyer:BUYER})});
  const response=await mallApi.fetch(request,{...LIVE_WIDGET,PAYMENTS_ENABLED:'false',DB:db});
  assert.equal(response.status,409);
  const payload=await response.json();
  assert.ok(payload.quote.blockers.includes('payments-disabled'));
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  assert.equal(db.db.prepare("SELECT stock_quantity FROM products WHERE id='p1'").get().stock_quantity,10);
});

test('guest payment remains restricted to the verified merchant of record on the single-MID Toss contract',async()=>{
  const db=migrated();
  const env={...LIVE_WIDGET,DB:db,MALL_EKODIAN_EMAILS:'not-the-seller@example.com'};
  const request={shareCode:'SHARE1',quantity:1,buyer:BUYER};
  const denied=await createOrder(env,request);
  assert.equal(denied.status,409);
  assert.ok(denied.quote?.blockers?.includes('merchant-of-record-not-authorized'));
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
  assert.equal(db.db.prepare("SELECT stock_quantity FROM products WHERE id='p1'").get().stock_quantity,10);
  const verified=await createOrder({...env,MALL_EKODIAN_EMAILS:'s@x'},request);
  assert.equal(verified.status,201);
  const wrongMode=await createOrder({...env,MALL_EKODIAN_EMAILS:'s@x',TOSS_CLIENT_KEY:'live_gck_abc',TOSS_SECRET_KEY:'test_gsk_abc'},request);
  assert.equal(wrongMode.status,409,'guest approval never bypasses matching Toss key mode');
});

const MEMBER_ID='0c58326e-bcd0-4f20-83af-0fb2f61fb7eb';
const OTHER_ID='1dbda4bc-b809-4c09-897e-bc4a7ff2d951';
const MEMBER={id:MEMBER_ID,email:'buyer@example.com',email_confirmed_at:'2026-11-05T01:00:00Z',is_anonymous:false};
const POINTS_ENV={...LIVE_WIDGET,MALL_MEMBER_POINT_EVIDENCE_ENABLED:'true',MALL_TOSS_MERCHANT_ONLY:'true',MALL_EKODIAN_EMAILS:'s@x'};
test('member-only 1% of paid KRW rounds down and never trusts anonymous or invalid sessions',()=>{
  assert.equal(pointEstimate(15000),150);
  assert.equal(pointEstimate(1999),19);
  assert.equal(pointEstimate(15000,5000),100);
  assert.equal(pointEstimate(15000,15000),0);
  assert.equal(pointEstimate(99),0);
  assert.equal(pointEstimate(-1),0);
  assert.equal(pointEstimate(1.2),0);
  assert.equal(eligibleMember(MEMBER),MEMBER_ID);
  assert.equal(eligibleMember({...MEMBER,is_anonymous:true}),null);
  assert.equal(eligibleMember({...MEMBER,email_confirmed_at:null}),null);
  assert.equal(eligibleMember({...MEMBER,id:'not-a-uuid'}),null);
});
test('member receipt records one immutable 1% evidence only after Toss DONE, and refunds compensate it',async()=>{
  const db=migrated();
  const env={...POINTS_ENV,DB:db};
  const created=await createOrder(env,{shareCode:'SHARE1',quantity:1,buyer:BUYER,member:MEMBER});
  assert.equal(created.status,201,JSON.stringify(created));
  assert.equal(created.order.memberPoints.estimatedPoints,150);
  assert.equal(created.order.memberPoints.spendable,false);
  const order=db.db.prepare('SELECT * FROM orders WHERE id=?').get(created.order.id);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM member_purchase_point_events').get().n,0);
  const receipt={paymentKey:'test_paid_points',orderId:order.id,status:'DONE',totalAmount:15000,approvedAt:new Date().toISOString()};
  await recordConfirmedPayment(env,order,receipt,'TOSS');
  await recordConfirmedPayment(env,order,receipt,'TOSS');
  const points=db.db.prepare('SELECT * FROM member_purchase_point_orders WHERE order_id=?').get(order.id);
  assert.equal(points.auth_user_id,MEMBER_ID);
  assert.equal(points.eligible_points,150);
  assert.equal(points.state,'pending_core');
  assert.equal(memberPointsView(points).spendable,false);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM member_purchase_point_events').get().n,1);
  for(const refunded of [5000,5000,15000,15000,5000]){
    await db.batch(verifiedRefundPointStatements(env,order,refunded,new Date().toISOString()));
  }
  const events=db.db.prepare('SELECT event_kind,delta_points FROM member_purchase_point_events ORDER BY rowid').all();
  assert.deepEqual(events.map(x=>x.delta_points),[150,-50,-100]);
  const final=db.db.prepare('SELECT eligible_points,refunded_krw,state FROM member_purchase_point_orders WHERE order_id=?').get(order.id);
  assert.deepEqual({...final},{eligible_points:0,refunded_krw:15000,state:'reversed'});
});
test('guest orders and synthetic financial rehearsals cannot earn member rewards',async()=>{
  const db=migrated();
  const env={...POINTS_ENV,DB:db};
  const guest=await createOrder(env,{shareCode:'SHARE1',buyer:BUYER});
  assert.equal(guest.status,201);
  assert.equal(guest.order.memberPoints,null);
  const guestRow=db.db.prepare('SELECT * FROM orders WHERE id=?').get(guest.order.id);
  await recordConfirmedPayment(env,guestRow,{paymentKey:'guest_payment',status:'DONE',totalAmount:15000},'TOSS');
  const fake=await createOrder(env,{shareCode:'SHARE1',buyer:BUYER,member:MEMBER});
  const fakeRow=db.db.prepare('SELECT * FROM orders WHERE id=?').get(fake.order.id);
  await recordConfirmedPayment(env,fakeRow,{paymentKey:'rehearsal_payment',status:'DONE',totalAmount:15000},'REHEARSAL');
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM member_purchase_point_events').get().n,0);
});
test('HTTP member identity is verified, browser spoofing is rejected and points proof is owner-only',async()=>{
  const db=migrated();
  const env={...POINTS_ENV,DB:db,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'};
  const old=globalThis.fetch;
  try{
    globalThis.fetch=async(_url,{headers}={})=>{
      if(String(headers?.authorization).includes('INVALID'))return new Response('{}',{status:401});
      const id=String(headers?.authorization).includes('OTHER')?OTHER_ID:MEMBER_ID;
      return new Response(JSON.stringify({...MEMBER,id}),{status:200,headers:{'content-type':'application/json'}});
    };
    const orderReq=token=>new Request('https://ekodi.kr/api/public/orders',{
      method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:JSON.stringify({shareCode:'SHARE1',buyer:BUYER,member:{id:OTHER_ID,email_confirmed_at:'faked'}})
    });
    assert.equal((await mallApi.fetch(orderReq('INVALID'),env)).status,401);
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,0);
    const created=await mallApi.fetch(orderReq('VALID'),env);
    assert.equal(created.status,201,await created.clone().text());
    const orderId=(await created.json()).order.id;
    assert.equal(db.db.prepare('SELECT auth_user_id FROM member_purchase_point_orders WHERE order_id=?').get(orderId).auth_user_id,MEMBER_ID);
    const order=db.db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    await recordConfirmedPayment(env,order,{paymentKey:'member_owned',status:'DONE',totalAmount:15000},'TOSS');
    const path='https://ekodi.kr/api/public/orders/'+encodeURIComponent(orderId)+'/points';
    assert.equal((await mallApi.fetch(new Request(path,{headers:{authorization:'Bearer OTHER'}}),env)).status,404);
    const proof=await mallApi.fetch(new Request(path,{headers:{authorization:'Bearer VALID'}}),env);
    assert.equal(proof.status,200);
    assert.equal((await proof.json()).memberPoints.points,150);
  }finally{globalThis.fetch=old;}
});
