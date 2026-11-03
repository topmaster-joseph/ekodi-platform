import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBooksNetworkRequest } from '../books-network-control.js';

function fakeDb(){
  const data={stores:[{id:1,slug:'my-library',owner_email:'member@example.test',name:'내 서점',description:'',logo_url:'',theme:'paper',status:'active',created_at:'',updated_at:''}],titles:[]};
  return {
    batch:async()=>{},
    prepare(sql){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async run(){return {success:true}},
        async first(){
          if(sql.includes('FROM admins'))throw Error('A normal member must not query platform admin grants');
          return null;
        },
        async all(){
          if(sql.includes('FROM books_creator_stores WHERE owner_email'))return {results:data.stores.filter(x=>x.owner_email===args[0])};
          if(sql.includes('FROM books_creator_titles WHERE owner_email'))return {results:data.titles};
          return {results:[]};
        }
      };
    }
  };
}
const TOKEN='signed-google-token-'.repeat(25);
const endpoint='https://ekodi.kr/api/books/me';
const request=path=>new Request('https://ekodi.kr'+path,{headers:{authorization:'Bearer '+TOKEN,origin:'https://ekodi.kr'}});
test('verified member accesses only own publishing snapshot, not admin roster',async t=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.match(String(url),/supabase.co\/auth\/v1\/user$/);
    return Response.json({id:'dd7d14bc-25b6-4c66-99bf-85ef42d13780',email:'member@example.test',email_confirmed_at:'2026-11-01T00:00:00Z'});
  };
  t.after(()=>{globalThis.fetch=originalFetch});
  const db=fakeDb();
  const response=await handleBooksNetworkRequest(request('/api/books/me'),{DB:db,ALLOWED_ORIGINS:'https://ekodi.kr'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.account.email,'member@example.test');
  assert.equal(body.stores.length,1);
  const forbidden=await handleBooksNetworkRequest(request('/api/books/admin/network'),{DB:db,ALLOWED_ORIGINS:'https://ekodi.kr'});
  assert.equal(forbidden.status,403);
});
test('unverified or forged member identity cannot open a private publishing workspace',async t=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:'dd7d14bc-25b6-4c66-99bf-85ef42d13780',email:'admin@example.test',email_confirmed_at:null});
  t.after(()=>{globalThis.fetch=originalFetch});
  const response=await handleBooksNetworkRequest(request('/api/books/me'),{DB:fakeDb(),ALLOWED_ORIGINS:'https://ekodi.kr'});
  assert.equal(response.status,401);
});
test('missing bearer token is not treated as an authenticated session',async()=>{
  const response=await handleBooksNetworkRequest(new Request(endpoint),{DB:fakeDb()});
  assert.equal(response.status,401);
});
