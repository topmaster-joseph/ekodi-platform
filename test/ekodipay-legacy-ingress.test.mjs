import test from 'node:test';
import assert from 'node:assert/strict';
import {routeIsExactHost,exposure} from '../scripts/audit-ekodipay-legacy-ingress.mjs';

test('only exact host routes count as payment legacy ingress',()=>{
 const host=['pay','ekodi','kr'].join('.');
 assert.equal(routeIsExactHost(host+'/*',host),true);
 assert.equal(routeIsExactHost('*.ekodi.kr/*',host),false);
 assert.equal(routeIsExactHost('ekodi.kr/ekodipay*',host),false);
});
test('DNS, Worker route, custom domain and accessible HTTP all expose a public entry',()=>{
 assert.equal(exposure({domains:[{service:'x'}]}).workerDomains,1);
 assert.equal(exposure({routes:[{script:'x'}]}).exactRoutes,1);
 assert.equal(exposure({dns:[{type:'A'},{type:'AAAA'},{type:'TXT'}]}).addressRecords,2);
 assert.equal(exposure({httpStatus:200}).publiclyReachable,true);
 assert.equal(exposure({httpStatus:410}).publiclyReachable,false);
});
test('missing provider inventory is never represented as verified private',()=>{
 const result=exposure({});
 assert.equal(result.verifiedPrivate,false);
 assert.equal(result.sourceOfTruthClean,true);
});
