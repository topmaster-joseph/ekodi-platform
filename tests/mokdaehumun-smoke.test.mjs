import { strict as assert } from 'node:assert';
import { isMokdaehumunPath, mokdaehumunPage } from '../mokdaehumun-public-page.js';
import { isMokdaehumunApiPath, mokdaehumunApiResponse } from '../mokdaehumun-member-api.js';

assert.equal(isMokdaehumunPath('/mokdaehumun'),true);
assert.equal(isMokdaehumunPath('/mokdaehumun/'),true);
assert.equal(isMokdaehumunPath('/mokdaehumun-private'),false);
assert.equal(isMokdaehumunApiPath('/mokdaehumun/api/members'),true);
const html=await mokdaehumunPage().text();
assert.match(html,/목대후문 자율상권조합/);
assert.doesNotMatch(html,/주민등록번호|출자금 명부/);
const env={DB:{prepare(){throw Error('Unauthorized DB access')}}};
const request=new Request('https://ekodi.kr/mokdaehumun/api/members');
const response=await mokdaehumunApiResponse(request,env,{resolveSession:async()=>({principal:null})});
assert.equal(response.status,401);
const crossHost=await mokdaehumunApiResponse(new Request('https://other.example/mokdaehumun/api/members'),env);
assert.equal(crossHost.status,403);
console.log('mokdaehumun smoke tests passed');
