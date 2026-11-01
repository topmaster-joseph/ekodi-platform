// AUDIOBOOK-BONUS-001: purchase ownership, editorial approvals, private R2,
 // no extra payment, refund/entitlement revocation and preparation fail-closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { complimentaryAudiobookPolicy, availableAudiobook, validateAudioChapter } from '../books-audiobook.js';
import { quote, library, downloadAudiobook, adminRoute } from '../books-commerce.js';

const originalCatalog=JSON.parse(fs.readFileSync(new URL('../books/books.json',import.meta.url),'utf8'));
const policy=JSON.parse(fs.readFileSync(new URL('../books/commerce.json',import.meta.url),'utf8'));
const rawUser={id:'a-buyer',email:'reader@example.com',email_confirmed_at:'2026-01-01T00:00:00Z'};
const operator={...rawUser,id:'a-operator',email:'op@ekodi.kr'};
const readerRequest=()=>new Request('https://ekodi.kr/books/api/commerce/library',{headers:{authorization:'Bearer token'}});
const savedFetch=globalThis.fetch;
test.beforeEach(()=>{globalThis.fetch=async url=>String(url).includes('/auth/v1/user')?new Response(JSON.stringify(rawUser)):savedFetch(url)});
test.afterEach(()=>{globalThis.fetch=savedFetch});

function fixtureBook(){
  const book=structuredClone(originalCatalog.books[0]);
  book.audiobook={
    freeWithEbook:true,status:'approved',sourceEdition:book.edition,
    rightsApproved:true,authorApproved:true,publisherApproved:true,
    voicePerformanceApproved:true,accessibilityReviewed:true,
    tracks:[
      {number:1,title:'서문',format:'mp3',key:book.id+'/audiobook/01-preface.mp3',sha256:'0b4d32ac99bf6d4ba36fc9e507653e8cb2ca2b16d1fa8549a24c6ade1379064c'},
      {number:2,title:'첫 장',format:'mp3',key:book.id+'/audiobook/02-chapter.mp3',sha256:'0b4d32ac99bf6d4ba36fc9e507653e8cb2ca2b16d1fa8549a24c6ade1379064c'},
    ],
  };
  return book;
}
function d1(){
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql',import.meta.url),'utf8').split('INSERT OR IGNORE')[0]);
  db.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql',import.meta.url),'utf8'));
  const stmt=(sql,args=[])=>({
    bind:(...a)=>stmt(sql,a),
    first:async()=>db.prepare(sql).get(...args)??null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>{db.prepare(sql).run(...args);return{meta:{changes:1}}},
  });
  return{raw:db,prepare:sql=>stmt(sql)};
}
function fileBucket(book,{missing=false,unapproved=false}={}){
  const bytes=new Uint8Array(180);bytes.set([0x49,0x44,0x33]);
  const objects=new Map();
  for(const track of book.audiobook.tracks){
    if(missing && track.number===2)continue;
    objects.set(track.key,{body:bytes,size:bytes.length,customMetadata:{
      bookId:book.id,kind:'audiobook-chapter',edition:book.edition,
      approved:unapproved?'false':'true',sha256:track.sha256,
    }});
  }
  return{
    head:async key=>objects.get(key)||null,
    get:async key=>objects.get(key)||null,
    put:async(key,body,opts)=>{objects.set(key,{size:body.length,body,customMetadata:opts.customMetadata})},
    objects,
  };
}
const envFor=(book,db,files)=>({
  DB:db,BOOK_FILES:files,ASSETS:{fetch:async req=>new Response(JSON.stringify(new URL(req.url).pathname==='/books.json'?{books:[book]}:policy))},
  PAYMENTS_ENABLED:'false',OPERATOR_EMAILS:'op@ekodi.kr',
});
function grant(db,buyerId='a-buyer',bookId='BOOK-EKODI-000001'){
  db.raw.prepare('INSERT INTO books_entitlements (buyer_user_id,book_id,order_id,buyer_email,granted_at) VALUES (?,?,?,?,?)')
    .run(buyerId,bookId,'EKB-SYNTHETIC','reader@example.com','2026-10-29T00:00:00Z');
}
test('published verified EPUB qualifies for free bonus, unpublished placeholder does not',()=>{
  assert.equal(complimentaryAudiobookPolicy(originalCatalog.books[0]).included,true);
  assert.equal(complimentaryAudiobookPolicy(originalCatalog.books[0]).approved,false);
  assert.equal(complimentaryAudiobookPolicy(originalCatalog.books[0]).priceKrw,0);
  assert.equal(complimentaryAudiobookPolicy(originalCatalog.books[1]).included,false);
  assert.equal(complimentaryAudiobookPolicy(originalCatalog.books[1]).state,'not_yet_published');
});
test('every editorial and voice/rights gate, source edition and catalog track must pass',()=>{
  const book=fixtureBook();
  assert.equal(complimentaryAudiobookPolicy(book).approved,true);
  for(const k of ['rightsApproved','authorApproved','publisherApproved','voicePerformanceApproved','accessibilityReviewed']){
    const b=structuredClone(book);b.audiobook[k]=false;
    assert.equal(complimentaryAudiobookPolicy(b).approved,false,k);
  }
  for(const [k,v] of [['status','production_pending'],['freeWithEbook',false],['sourceEdition','wrong']]){
    const b=structuredClone(book);b.audiobook[k]=v;
    assert.equal(complimentaryAudiobookPolicy(b).approved,false,k);
  }
  const traversal=structuredClone(book);traversal.audiobook.tracks[0].key='../other-book.mp3';
  assert.equal(complimentaryAudiobookPolicy(traversal).approved,false);
  const digestMismatch=structuredClone(book);digestMismatch.audiobook.tracks[0].sha256='not-a-digest';
  assert.equal(complimentaryAudiobookPolicy(digestMismatch).approved,false);
  const ordered=structuredClone(book);ordered.audiobook.tracks[0].number=3;
  assert.equal(complimentaryAudiobookPolicy(ordered).approved,false);
});
test('all approved audio chapters must be privately present in R2 with book+edition metadata',async()=>{
  const b=fixtureBook();
  assert.equal((await availableAudiobook({BOOK_FILES:fileBucket(b)},b)).ready,true);
  assert.deepEqual((await availableAudiobook({BOOK_FILES:fileBucket(b,{missing:true})},b)).tracks,[]);
  assert.equal((await availableAudiobook({BOOK_FILES:fileBucket(b,{unapproved:true})},b)).ready,false);
  assert.equal((await availableAudiobook({},b)).ready,false);
});
test('library grants audiobook without second order/charge to an already owned ebook, only after approvals',async()=>{
  const book=fixtureBook(),db=d1(),env=envFor(book,db,fileBucket(book));grant(db);
  const result=await library(env,readerRequest());
  assert.equal(result.status,200);
  assert.equal(result.data.items.length,1);
  assert.equal(result.data.items[0].audiobook.priceKrw,0);
  assert.equal(result.data.items[0].audiobook.ready,true);
  assert.equal(result.data.items[0].audiobook.tracks.length,2);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM books_orders').get().n,0);
  const q=await quote(env,readerRequest(),book.id);
  assert.equal(q.data.audiobook.priceKrw,0);
  assert.equal(q.data.price.amount,9900);
  assert.equal(q.data.checkout.open,false,'no change to payment gate');
});
test('only buyer may download private approved MP3; refund revocation denies without exposing object keys',async()=>{
  const book=fixtureBook(),db=d1(),files=fileBucket(book),env=envFor(book,db,files);
  const noPurchase=await downloadAudiobook(env,readerRequest(),book.id,1);
  assert.equal(noPurchase.status,403);
  grant(db);
  const ok=await downloadAudiobook(env,readerRequest(),book.id,1);
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get('content-type'),'audio/mpeg');
  assert.equal(ok.headers.get('cache-control'),'private, no-store');
  assert.ok(ok.headers.get('content-disposition').includes('attachment'));
  assert.equal((await ok.arrayBuffer()).byteLength,180);
  assert.equal((await downloadAudiobook(env,readerRequest(),book.id,3)).status,409);
  db.raw.prepare("UPDATE books_entitlements SET revoked_at='2026-10-29T10:00:00Z'").run();
  assert.equal((await downloadAudiobook(env,readerRequest(),book.id,1)).status,403);
  assert.equal((await library(env,readerRequest())).data.items.length,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM books_orders').get().n,0);
});
test('MP3 upload validates frame header and size; operator upload draft never silently unlocks buyer access',async()=>{
  const book=fixtureBook();book.audiobook.status='production_pending';
  const db=d1(),bucket=fileBucket(book),env=envFor(book,db,bucket);
  const bad=validateAudioChapter(new TextEncoder().encode('not a real MP3 encoded chapter'.repeat(10)));
  assert.equal(bad.ok,false);
  assert.equal(validateAudioChapter(new Uint8Array(32)).ok,false);
  const bytes=new Uint8Array(256);bytes.set([0x49,0x44,0x33]);assert.equal(validateAudioChapter(bytes).ok,true);
  const path='/admin/audiobooks/'+book.id+'/1';
  const r=new Request('https://ekodi.kr/books/api/commerce'+path,{method:'PUT',headers:{authorization:'Bearer token','content-type':'audio/mpeg'},body:bytes});
  assert.equal((await adminRoute(env,r,path,new URL(r.url))).status,403);
  globalThis.fetch=async()=>new Response(JSON.stringify(operator));
  const uploaded=await adminRoute(env,r,path,new URL(r.url));
  assert.equal(uploaded.status,200);
  assert.equal(uploaded.data.approvedForDelivery,false);
  assert.equal(bucket.objects.get(book.audiobook.tracks[0].key).customMetadata.approved,'false');
  assert.equal((await availableAudiobook(env,book)).ready,false);
  // Even when catalog human-review flags are later completed, the uploaded
  // actual bytes must exactly match the protected reviewed MP3 master hash.
  book.audiobook.status='approved';
  const wrong=new Uint8Array(180);wrong.set([0x49,0x44,0x33]);wrong[90]=1;
  const wrongReq=new Request('https://ekodi.kr/books/api/commerce'+path,{method:'PUT',headers:{authorization:'Bearer token','content-type':'audio/mpeg'},body:wrong});
  const rejected=await adminRoute(env,wrongReq,path,new URL(wrongReq.url));
  assert.equal(rejected.status,409);
  assert.equal(rejected.data.error.includes('해시'),true);
  assert.equal(bucket.objects.get(book.audiobook.tracks[0].key).customMetadata.approved,'false');

});

// EKODI-VOICE-001: 운영자 본인 동의 음성 샘플은 비공개 저장만, 렌더링 초안은 승인·해시 일치 후에만 배포 가능으로 전환.
function richBucket(){
  const objects=new Map();
  const wrap=(o)=>o&&{...o,arrayBuffer:async()=>o.body.buffer.slice(o.body.byteOffset,o.body.byteOffset+o.body.byteLength),json:async()=>JSON.parse(new TextDecoder().decode(o.body))};
  return{objects,head:async k=>objects.get(k)||null,get:async k=>wrap(objects.get(k)),
    put:async(k,body,opts={})=>{const b=typeof body==='string'?new TextEncoder().encode(body):body;objects.set(k,{body:b,size:b.length,customMetadata:opts.customMetadata||{}})}};
}
test('voice sample: operator-only, explicit self-recording consent, real audio, private key only',async()=>{
  const book=fixtureBook(),db=d1(),bucket=richBucket(),env=envFor(book,db,bucket);
  const path='/admin/voice/sample';
  const webm=new Uint8Array(70*1024);webm.set([0x1a,0x45,0xdf,0xa3]);
  const req=(headers,body=webm)=>new Request('https://ekodi.kr/books/api/commerce'+path,{method:'PUT',headers:{authorization:'Bearer token',...headers},body});
  assert.equal((await adminRoute(env,req({'x-ekodi-voice-consent':'self-recorded-for-ekodi-audiobooks'}),path,new URL('https://ekodi.kr'))).status,403,'buyers cannot upload');
  globalThis.fetch=async()=>new Response(JSON.stringify(operator));
  assert.equal((await adminRoute(env,req({}),path,new URL('https://ekodi.kr'))).status,400,'consent header required');
  assert.equal((await adminRoute(env,req({'x-ekodi-voice-consent':'self-recorded-for-ekodi-audiobooks'},new TextEncoder().encode('x'.repeat(70000))),path,new URL('https://ekodi.kr'))).status,400,'non-audio refused');
  const ok=await adminRoute(env,req({'x-ekodi-voice-consent':'self-recorded-for-ekodi-audiobooks'}),path,new URL('https://ekodi.kr'));
  assert.equal(ok.status,200);assert.equal(ok.data.format,'webm');
  const keys=[...bucket.objects.keys()];
  assert.ok(keys.every(k=>k.startsWith('_voice/ekodi-narrator/')),'stored only under the private voice prefix');
  const state=await adminRoute(env,new Request('https://ekodi.kr/x',{headers:{authorization:'Bearer token'}}),path,new URL('https://ekodi.kr'));
  assert.equal(state.data.present,true);assert.equal(state.data.consent,'self-recorded-for-ekodi-audiobooks');
});
test('rendered drafts become deliverable only after catalog approval and an exact hash match',async()=>{
  const book=fixtureBook(),db=d1(),bucket=richBucket(),env=envFor(book,db,bucket);
  const bytes=new Uint8Array(180);bytes.set([0x49,0x44,0x33]);
  await bucket.put(book.audiobook.tracks[0].key,bytes); // workflow upload: no approval metadata
  globalThis.fetch=async()=>new Response(JSON.stringify(operator));
  const path='/admin/audiobooks/'+book.id+'/1/promote';
  const post=()=>adminRoute(env,new Request('https://ekodi.kr/x',{method:'POST',headers:{authorization:'Bearer token'}}),path,new URL('https://ekodi.kr'));
  book.audiobook.status='production_pending';
  assert.equal((await post()).status,409,'not approved yet');
  book.audiobook.status='approved';
  const ok=await post();
  assert.equal(ok.status,200);
  assert.equal(bucket.objects.get(book.audiobook.tracks[0].key).customMetadata.approved,'true');
  bytes[100]=7;await bucket.put(book.audiobook.tracks[0].key,bytes);
  assert.equal((await post()).status,409,'changed bytes are refused');
});
