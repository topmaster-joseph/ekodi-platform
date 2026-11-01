import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedOwnerAal2 } from '../invest-owner-mfa.js';
import { investMyRoute } from '../invest-my-workspace.js';

const NOW=Date.UTC(2026,9,30,0,0,0);
const payload=(patch={})=>({
 iss:'https://renzehysxirjilvdxacv.supabase.co/auth/v1',
 sub:'owner-subject',
 aal:'aal2',
 session_id:'session-id-supabase-1234',
 iat:Math.floor(NOW/1000)-60,
 exp:Math.floor(NOW/1000)+3600,
 ...patch
});
const token=claims=>{
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 return enc({alg:'HS256',typ:'JWT'})+'.'+enc(claims)+'.'+Buffer.from('test-signature').toString('base64url');
};
const request=t=>new Request('https://ekodi.kr/v1/invest/autopilot/live/readiness',{headers:{authorization:'Bearer '+t}});
test('owner AAL2 is accepted only for identity matching the same previously verified JWT',()=>{
 assert.equal(verifiedOwnerAal2(request(token(payload())),'owner-subject',NOW),true);
 for(const mismatch of [
  {aal:'aal1'}, {sub:'different-user'}, {iss:'https://untrusted.invalid/auth/v1'},
  {session_id:''}, {iat:Math.floor(NOW/1000)+60}, {exp:Math.floor(NOW/1000)-1},
 ]){
  assert.equal(verifiedOwnerAal2(request(token(payload(mismatch))),'owner-subject',NOW),false,JSON.stringify(mismatch));
 }
 assert.equal(verifiedOwnerAal2(request('invalid'),'owner-subject',NOW),false);
 assert.equal(verifiedOwnerAal2(request(token(payload())),'other-person',NOW),false);
 assert.equal(verifiedOwnerAal2(new Request('https://ekodi.kr/v1/invest/autopilot/live/readiness'),'owner-subject',NOW),false);
});

test('MFA controls are inside the owner-hidden research workspace and require deliberate interaction',async()=>{
 const html=await (await investMyRoute(new Request('https://ekodi.kr/invest'),{})).text();
 assert.match(html,/<section id="owner" hidden>/);
 for(const key of ['liveMfaPanel','liveMfaEnroll','liveMfaCode','liveMfaVerify','liveMfaStatus','liveMfaSecret']){
  assert.match(html,new RegExp('id="'+key+'"'));
 }
 assert.ok(html.indexOf('id="owner" hidden')<html.indexOf('id="liveMfaPanel"'));
 const js=await (await investMyRoute(new Request('https://ekodi.kr/invest/app.js'),{})).text();
 for(const k of ['auth.mfa.enroll','auth.mfa.challenge','auth.mfa.verify','auth.mfa.getAuthenticatorAssuranceLevel','auth.mfa.listFactors']){
  assert.ok(js.includes(k),k);
 }
 assert.match(js,/if\(!sessionClient\|\|!verified\|\|!stepUpToken\)return/);
 assert.match(js,/strongMfa\?\.verified===true/);
 assert.match(html,/value="kis">한국투자증권/);
 assert.match(html,/id="liveBrokerDocs"/);
 assert.match(js,/const safeDocs=\{toss:/);
 assert.match(js,/r\.broker\.docsUrl===url/);
 assert.match(js,/liveMfaEnroll'\)\.addEventListener\('click',enrollLiveMfa/);
 assert.doesNotMatch(js,/localStorage\.setItem\([^\n]*[Mm][Ff][Aa]|sessionStorage\.setItem\([^\n]*[Mm][Ff][Aa]/);
});
