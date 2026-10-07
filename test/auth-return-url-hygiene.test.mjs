import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthReturnPost, AUTH_RETURN_URL_HYGIENE } from '../auth-return-post.js';

test('form-post auth return exchanges one-time token without reflecting it into the document URL',async()=>{
  const token='a'.repeat(64);
  let exchangeBody=null;
  const request=new Request('https://seonammedi.kr/admin?view=finance',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({ekodi_auth_return:'1',ekodi_token:token,ekodi_type:'email'})
  });
  const response=await handleAuthReturnPost(request,{fetchImpl:async(url,options)=>{
    assert.equal(url,'https://renzehysxirjilvdxacv.supabase.co/auth/v1/verify');
    exchangeBody=JSON.parse(options.body);
    return new Response(JSON.stringify({
      access_token:'access-token-value',
      refresh_token:'refresh-token-value',
      expires_in:3600,
      token_type:'bearer',
      user:{id:'user-1',email:'admin@example.com'}
    }),{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.equal(exchangeBody.token_hash,token);
  assert.equal(exchangeBody.type,'email');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-auth-return'),'form-post-v1');
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const html=await response.text();
  assert.equal(html.includes(token),false,'one-time token must not be reflected into HTML');
  assert.match(html,/history\.replaceState/);
  assert.match(html,/location\.replace\(clean\.href\)/);
  assert.match(html,/localStorage\.setItem/);
});

test('ordinary POST is not captured by the auth return bridge',async()=>{
  const request=new Request('https://seonammedi.kr/board/voices',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({message:'hello'})
  });
  assert.equal(await handleAuthReturnPost(request,{fetchImpl:async()=>{throw new Error('unexpected')}}),null);
});

test('URL hygiene policy exports the forced no-address-bar contract',()=>{
  assert.equal(AUTH_RETURN_URL_HYGIENE.policyId,'AUTH-RETURN-URL-HYGIENE-001');
  assert.equal(AUTH_RETURN_URL_HYGIENE.transport,'form-post');
  assert.equal(AUTH_RETURN_URL_HYGIENE.oneTimeCredentialInAddressBar,false);
});
