import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPECIALIST_CONTRACTS,
  normalizeMenuItem,projectMenuToChannel,menuMutationDecision,
  normalizeOrder,transitionOrder,externalOrderMutationDecision,deliveryDispatchDecision,
  normalizeReview,classifyReview,draftReviewReply,reviewPublishDecision
} from '../management-specialists/index.js';

test('Menu AI keeps one canonical item and channel projections as drafts',()=>{
  const menu=normalizeMenuItem({id:'chicken-1',name:'후라이드',price:19000,options:[{id:'size',name:'큰 사이즈',priceDelta:3000}]});
  const channel=projectMenuToChannel(menu,'delivery-app-a',{externalId:'A-10'});
  assert.equal(menu.source,'ekodi-canonical-menu');
  assert.equal(channel.canonicalId,'chicken-1');
  assert.equal(channel.mutationState,'draft');
  assert.equal(menuMutationDecision('publish').allowed,false);
  assert.equal(menuMutationDecision('change_price',{humanApproved:true}).reason,'official_adapter_disabled');
});

test('Order AI accepts only explicit canonical status transitions',()=>{
  const order=normalizeOrder({id:'O-1',source:'qr',status:'received',lines:[{menuItemId:'chicken-1',name:'후라이드',quantity:1,unitPrice:19000}],total:19000});
  assert.equal(transitionOrder(order,'preparing').allowed,false);
  const accepted=transitionOrder(order,'accepted');
  assert.equal(accepted.allowed,true);
  assert.equal(accepted.order.status,'accepted');
  assert.equal(externalOrderMutationDecision().reason,'human_approval_required');
  assert.equal(deliveryDispatchDecision({humanApproved:true}).reason,'official_adapter_disabled');
});

test('Review AI classifies and drafts but never auto-publishes',()=>{
  const review=normalizeReview({id:'R-1',channel:'delivery-app-a',rating:2,body:'배달이 너무 늦었어요'});
  const analysis=classifyReview(review);
  const draft=draftReviewReply(review,{businessName:'테스트매장'});
  assert.equal(analysis.sentiment,'negative');
  assert.ok(analysis.issues.includes('delay'));
  assert.equal(draft.state,'draft');
  assert.equal(draft.autoPublished,false);
  assert.equal(reviewPublishDecision().reason,'human_approval_required');
});

test('specialists own separate canonical domains and default every external adapter to disabled',()=>{
  assert.deepEqual(SPECIALIST_CONTRACTS.menu.owns,['menu','channel-menu-mapping']);
  assert.deepEqual(SPECIALIST_CONTRACTS.order.owns,['order']);
  assert.deepEqual(SPECIALIST_CONTRACTS.review.owns,['review']);
  for(const contract of Object.values(SPECIALIST_CONTRACTS)) assert.equal(contract.defaultExternalAdapterState,'disabled');
});

test('specialist normalized records do not expose customer PII fields',()=>{
  const order=normalizeOrder({id:'O-2',customer_phone:'01012345678'});
  const review=normalizeReview({id:'R-2',customer_name:'홍길동'});
  assert.equal(order.containsCustomerPii,false);
  assert.equal(review.containsCustomerPii,false);
  assert.equal('customer_phone' in order,false);
  assert.equal('customer_name' in review,false);
});
