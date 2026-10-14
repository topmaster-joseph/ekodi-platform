import test from 'node:test';
import assert from 'node:assert/strict';
import {businessOsBudget,businessOsGate,BUSINESS_OS_STAGE} from '../business-os-core.js';
import {businessOsCommonResponse,isBusinessOsCommonPath} from '../business-os-public-api.js';
const url=p=>'https://ekodi.kr'+p;
test('Business OS budget uses accepted not harvested weight',()=>{
 const data=businessOsBudget({houses:2,sqm:100,yieldKg:3,acceptance:80,unitPrice:5000,capex:1000000,supplies:100000,labor:200000,transport:30000,cycles:2});
 assert.equal(data.harvestedKg,600);assert.equal(data.acceptedKg,480);
 assert.equal(data.revenue,2400000);assert.equal(data.totalCost,830000);assert.equal(data.margin,1570000);
 assert.equal(data.breakEvenUnitPrice,830000/480);
});
test('Business OS universally blocks contract and money execution',()=>{
 for(const action of ['transfer_money','sign_contract','approve_purchase_contract','approve_delivery_settlement'])assert.deepEqual(businessOsGate(action).decision,'blocked');
 assert.equal(businessOsGate('approve_spending').decision,'human_review');
 assert.equal(BUSINESS_OS_STAGE.length,6);
});
test('Business OS common API only serves its named endpoints',async()=>{
 assert.equal(isBusinessOsCommonPath('/ekodibiz/business-os/estimate'),true);
 assert.equal(isBusinessOsCommonPath('/ekodibiz/business-os/admin'),false);
 let response=await businessOsCommonResponse(new Request(url('/ekodibiz/business-os/capabilities')));
 assert.equal(response.status,200);assert.equal((await response.json()).persistentData,false);
 response=await businessOsCommonResponse(new Request(url('/ekodibiz/business-os/estimate'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({houses:1,sqm:100,yieldKg:2,acceptance:90,unitPrice:5000,capex:1000,supplies:100,labor:100,transport:100,cycles:2})}));
 assert.equal(response.status,200);assert.equal((await response.json()).acceptedKg,180);
 response=await businessOsCommonResponse(new Request(url('/ekodibiz/business-os/action-policy'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'sign_contract'})}));
 assert.equal((await response.json()).executable,false);
});
test('Budget endpoint rejects invalid or missing numbers',async()=>{
 const response=await businessOsCommonResponse(new Request(url('/ekodibiz/business-os/estimate'),{method:'POST',headers:{'content-type':'application/json'},body:'{"houses":1}'}));
 assert.equal(response.status,400);
});
