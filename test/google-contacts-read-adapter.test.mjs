import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listGoogleContactsForReview,SCAN_FIELDS} from '../google-contacts-read-adapter.js';
const p=id=>({resourceName:'people/c'+id,metadata:{sources:[{type:'CONTACT'}]}});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('all pages, contact source and stable parameters',async()=>{
  const calls=[];
  const people=await listGoogleContactsForReview({accessToken:'synthetic',fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init}); return calls.length===1?response({connections:[p('1')],nextPageToken:'next'}):response({connections:[p('2')]})}});
  assert.equal(people.length,2); assert.equal(calls[1].url.searchParams.get('pageToken'),'next');
  for(const c of calls){assert.equal(c.url.searchParams.get('personFields'),SCAN_FIELDS);assert.equal(c.url.searchParams.get('sources'),'READ_SOURCE_TYPE_CONTACT');assert.equal(c.init.method,'GET');assert.equal(c.init.redirect,'error')}
});
test('no token fails before network',async()=>assert.rejects(listGoogleContactsForReview({fetchImpl:()=>{throw Error('unexpected network')}}),{code:'CONTACTS_AUTH_REQUIRED'}));
test('provider 429 fails closed',async()=>assert.rejects(listGoogleContactsForReview({accessToken:'synthetic',fetchImpl:async()=>response({},429)}),{code:'CONTACTS_RATE_LIMITED'}));
test('repeated token fails closed',async()=>assert.rejects(listGoogleContactsForReview({accessToken:'synthetic',fetchImpl:async()=>response({nextPageToken:'same'})}),{code:'CONTACTS_PAGINATION_LOOP'}));
test('page limit never returns partial result',async()=>assert.rejects(listGoogleContactsForReview({accessToken:'synthetic',maxPages:1,fetchImpl:async()=>response({connections:[p('1')],nextPageToken:'more'})}),{code:'CONTACTS_SCAN_INCOMPLETE'}));
test('profile source fails closed',async()=>assert.rejects(listGoogleContactsForReview({accessToken:'synthetic',fetchImpl:async()=>response({connections:[{resourceName:'people/c1',metadata:{sources:[{type:'PROFILE'}]}}]})}),{code:'CONTACTS_INCONSISTENT_SCAN'}));
