import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleBooksNetworkRequest, requiresVerifiedPublishingSubmission } from '../books-network-control.js';

const source = await readFile(new URL('../books-network-control.js', import.meta.url),'utf8');
const html = await readFile(new URL('../publishing/studio/index.html', import.meta.url),'utf8');
const app = await readFile(new URL('../publishing/studio/app.js', import.meta.url),'utf8');
const token='test-session-token-'.repeat(22);

function fakeDb(){
  const stats={changes:0};
  const owner='author@example.test';
  const original={id:7,owner_email:owner,store_id:null,title:'원고 초안',subtitle:'',author:'저자',description:'',cover_image:'',price_krw:0,buy_url:'',stage:'MANUSCRIPT',status:'DRAFT',created_at:'2026-11-01',updated_at:'2026-11-01'};
  return {
    stats,
    async batch(){return []},
    prepare(sql){
      let values=[];
      return {
        bind(...args){values=args;return this},
        async first(){
          if(sql.includes('FROM books_creator_titles WHERE id=? AND owner_email=?'))return values[0]===7&&values[1]===owner?original:null;
          if(sql.includes('FROM admins'))return null;
          if(sql.includes('FROM books_creator_titles WHERE id=?'))return original;
          return null;
        },
        async run(){stats.changes++;return {success:true,meta:{last_row_id:8,changes:1}}},
        async all(){return {results:[]}}
      };
    }
  };
}
function request(path,method,body){
  return new Request('https://ekodi.kr'+path,{method,
    headers:{authorization:'Bearer '+token,origin:'https://ekodi.kr','content-type':'application/json'},
    body:JSON.stringify(body)});
}
async function verifiedAuthor(t){
  const old=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.match(String(url),/supabase\.co\/auth\/v1\/user$/);
    return Response.json({id:'a1079052-dc45-4d91-8003-e1d8e33bf117',email:'author@example.test',email_confirmed_at:'2026-11-01T00:00:00Z'});
  };
  t.after(()=>{globalThis.fetch=old});
}

test('personal drafting remains available but review submission cannot be forged by a browser',async t=>{
  await verifiedAuthor(t);
  const db=fakeDb(),env={DB:db,ALLOWED_ORIGINS:'https://ekodi.kr'};
  for(const [path,method,body] of [
    ['/api/books/me/titles','POST',{title:'초안',author:'저자',status:'SUBMITTED',isPaid:true,verified:true}],
    ['/api/books/me/titles/7','PUT',{title:'수정',author:'저자',status:'SUBMITTED',role:'publisher',contract:true}]
  ]){
    const response=await handleBooksNetworkRequest(request(path,method,body),env);
    assert.equal(response.status,409,path);
    assert.equal((await response.json()).code,'PUBLISHER_SUBMISSION_REQUIRED',path);
  }
  assert.equal(db.stats.changes,0,'no unverified title or status write');
  const draft=await handleBooksNetworkRequest(request('/api/books/me/titles','POST',{title:'초안',author:'저자',status:'DRAFT'}),env);
  assert.equal(draft.status,201);
  assert.equal(db.stats.changes,1,'ordinary personal draft should persist');
});
test('admin review route must not manufacture a new submitted state',()=>{
  assert.equal(requiresVerifiedPublishingSubmission('SUBMITTED','DRAFT'),true);
  assert.equal(requiresVerifiedPublishingSubmission('SUBMITTED','REJECTED'),true);
  assert.equal(requiresVerifiedPublishingSubmission('SUBMITTED','SUBMITTED'),false);
  assert.equal(requiresVerifiedPublishingSubmission('DRAFT','SUBMITTED'),false);
  assert.match(source,/if \(requiresVerifiedPublishingSubmission\(status, current\.status\)\)/);
  assert.match(source,/PUBLISHER_SUBMISSION_REQUIRED/);
  assert.match(source,/PUBLISHER_HANDOFF_REQUIRED/);
});
test('studio keeps drafts and directs all review applications to verified publisher workflow',()=>{
  assert.match(html,/출간 검토 절차/);
  assert.match(html,/https:\/\/ekodi\.kr\/publishing\/human\/manage\//);
  assert.doesNotMatch(html,/button value="SUBMITTED"/);
  assert.match(app,/data\.status='DRAFT'/);
  assert.doesNotMatch(app,/event\.submitter\?\.value==='SUBMITTED'/);
  assert.match(html,/초안 저장/);
});
