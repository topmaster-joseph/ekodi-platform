import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoreOrderModel, STORE_ORDER_MODEL as M } from '../store-order-model.js';

const platformRow={id:'b1',provider:'ddangyo',order_no:'D-100',status:'received',fulfillment_type:'delivery',total:23000,net_receivable:20500,items:[{name:'후라이드',quantity:1,options:['순살']}],customer_display:'김**',delivery_area_hint:'청계면',order_url:'https://example.invalid/o/1',ordered_at:'2026-10-20T03:00:00Z',completed_at:null};

test('platform orders project into the canonical model without mutating the provider row',()=>{
  const before=JSON.stringify(platformRow);
  const order=M.fromPlatformOrder(platformRow,'jadam');
  assert.equal(JSON.stringify(platformRow),before);
  for(const key of ['id','store','provider','provider_order_id','order_type','status','ordered_at','customer','items','options','total','payment','fulfillment','raw_reference'])assert.ok(key in order,key);
  assert.equal(order.store,'jadam');
  assert.equal(order.provider,'ddangyo');
  assert.equal(order.provider_label,'땡겨요');
  assert.equal(order.provider_order_id,'D-100');
  assert.equal(order.status,'new');
  assert.equal(order.provider_status,'received');
  assert.equal(order.order_type,'delivery');
  assert.equal(order.total,23000);
  assert.equal(order.payment.net_receivable,20500);
  assert.deepEqual(order.items,[{name:'후라이드',quantity:1,options:['순살']}]);
  assert.equal(order.raw_reference.ledger,'store_platform_orders');
  assert.equal(order.raw_reference.row_id,'b1');
  assert.ok(Object.isFrozen(order)&&Object.isFrozen(order.raw_reference));
});

test('status mapping covers every provider lifecycle state and unknown values fail safe',()=>{
  const map={received:'new',accepted:'in_progress',preparing:'in_progress',ready:'in_progress',picked_up:'in_delivery',delivering:'in_delivery',completed:'completed',cancelled:'cancelled',rejected:'cancelled',unknown:'unknown',weird:'unknown'};
  for(const [raw,canonical] of Object.entries(map))assert.equal(M.fromPlatformOrder({...platformRow,status:raw}).status,canonical,raw);
  const sms={awaiting_customer_confirmation:'pending_customer',customer_confirmed:'new',store_accepted:'in_progress',completed:'completed',cancelled:'cancelled',rejected:'cancelled'};
  for(const [raw,canonical] of Object.entries(sms))assert.equal(M.fromSmsOrder({id:1,status:raw,created_at:'2026-10-20T01:00:00Z'}).status,canonical,raw);
  for(const status of Object.values(map))assert.ok(M.CANONICAL_STATUSES.includes(status));
});

test('SMS orders keep free text in their own ledger and never invent totals or items',()=>{
  const order=M.fromSmsOrder({id:7,store_slug:'pizzamaru',status:'customer_confirmed',raw_order_text:'치즈피자 1판',created_at:'2026-10-20T02:00:00Z'});
  assert.equal(order.provider,'sms');
  assert.equal(order.store,'pizzamaru');
  assert.equal(order.total,null);
  assert.deepEqual(order.items,[]);
  assert.equal(JSON.stringify(order).includes('치즈피자'),false);
  assert.equal(order.raw_reference.ledger,'store_sms_orders');
});

test('today summary uses the Asia/Seoul calendar day and counts only real completed sales',()=>{
  const now=Date.parse('2026-10-20T14:30:00Z'); // 23:30 KST on 10-20
  const orders=M.normalizeOrders({store:'jadam',platformOrders:[
    {...platformRow,id:'a',status:'completed',total:10000,ordered_at:'2026-10-19T16:00:00Z'}, // 01:00 KST 10-20 → today
    {...platformRow,id:'b',status:'received',total:5000,ordered_at:'2026-10-20T10:00:00Z'},
    {...platformRow,id:'c',status:'completed',total:7000,ordered_at:'2026-10-19T14:00:00Z'}, // 23:00 KST 10-19 → yesterday
    {...platformRow,id:'d',status:'cancelled',total:9000,ordered_at:'2026-10-20T11:00:00Z'},
  ],smsOrders:[{id:3,status:'awaiting_customer_confirmation',created_at:'2026-10-20T12:00:00Z'}]});
  const s=M.summarizeToday(orders,{now});
  assert.equal(s.day,'2026-10-20');
  assert.equal(s.orders,4);
  assert.equal(s.sales,10000);
  assert.equal(s.newOrders,1);
  assert.equal(s.needsAction,2);
  assert.equal(s.byProvider.ddangyo,3);
  assert.equal(s.byProvider.sms,1);
  assert.equal(orders[0].ordered_at>=orders[1].ordered_at,true);
});

test('normalizeOrders de-duplicates and tolerates missing inputs',()=>{
  assert.deepEqual(M.normalizeOrders(),[]);
  assert.deepEqual(M.normalizeOrders({platformOrders:null,smsOrders:'x'}),[]);
  const rows=M.normalizeOrders({platformOrders:[platformRow,platformRow]});
  assert.equal(rows.length,1);
  assert.equal(M.summarizeToday([],{now:Date.now()}).orders,0);
});

test('channel mode never claims an API connection that is not active',()=>{
  assert.equal(M.channelMode({connector:{status:'active',source_kind:'official_api'}}).mode,'official_api');
  assert.equal(M.channelMode({connector:{status:'ready',source_kind:'partner_import'}}).mode,'partner_import');
  assert.equal(M.channelMode({connector:{status:'expired'}}).mode,'broken');
  assert.equal(M.channelMode({connector:{status:'pending'},agentTarget:{configured:true}}).mode,'windows_app');
  assert.equal(M.channelMode({agentTarget:{configured:true}}).label,'Windows 앱 전환 방식');
  assert.equal(M.channelMode({}).label,'미연결');
  assert.equal(M.channelMode({connector:{status:'inactive',source_kind:'official_api'}}).mode,'not_connected');
  assert.equal(M.brokenConnectorCount([{status:'active'},{status:'error'},{status:'needs_reauth'},null]),2);
});

test('the factory is self-contained so it can be shipped to the browser via toString()',()=>{
  const rebuilt=new Function(`return (${createStoreOrderModel.toString()})();`)();
  assert.equal(rebuilt.fromPlatformOrder(platformRow,'yogurt').status,'new');
  assert.equal(rebuilt.channelMode({}).mode,'not_connected');
});
