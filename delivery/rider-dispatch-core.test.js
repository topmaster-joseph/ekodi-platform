import assert from 'node:assert/strict';
import {test} from 'node:test';
import {riderOrders,planTransition} from './rider-dispatch-core.js';
const rider=(userId,stores)=>({userId,memberships:stores.map(storeId=>({storeId,active:true,role:'rider'}))});
const a=rider('a',['one','two']),b=rider('b',['one']);
const ready={id:'order',storeId:'one',reference:'demo',status:'ready',version:0,riderId:null,total:123,customerPhone:'synthetic'};
test('multi-store scoped list excludes financial and customer data',()=>{
 const rows=riderOrders(a,[ready,{...ready,storeId:'two'},{...ready,storeId:'three'}]);
 assert.equal(rows.length,2);assert.equal(riderOrders(b,rows).length,1);
 assert.ok(rows.every(o=>!('total' in o)&&!('customerPhone' in o)));
});
test('claim, pickup and complete by assigned rider only',()=>{
 const claim=planTransition(a,ready,'claim',0);assert.equal(claim.ok,true);
 const claimed={...ready,...claim.patch};assert.equal(claimed.riderId,'a');
 assert.equal(planTransition(b,claimed,'claim',0).error,'conflict');
 assert.equal(planTransition(b,claimed,'pickup',1).ok,false);
 const pickup=planTransition(a,claimed,'pickup',1);assert.equal(pickup.ok,true);
 assert.equal(planTransition(a,{...claimed,...pickup.patch},'complete',2).ok,true);
 assert.equal(planTransition(a,claimed,'release',1).patch.riderId,null);
});
test('deny unauthorized, revoked, read-only, malformed and skipped state',()=>{
 for(const member of [null,rider('x',['other']),{userId:'x',memberships:[{storeId:'one',active:false,role:'rider'}]},{userId:'x',memberships:[{storeId:'one',active:true,role:'manager'}]}]) assert.equal(planTransition(member,ready,'claim',0).ok,false);
 for(const action of ['complete','constructor','unknown'])assert.equal(planTransition(a,ready,action,0).ok,false);
 assert.equal(planTransition(a,ready,'claim','0').ok,false);
});
