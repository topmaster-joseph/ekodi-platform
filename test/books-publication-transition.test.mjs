import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { genericAdminPublicMutationAllowed } from '../publishing/human/books-publication-transition.js';

const existing=()=>({
 id:'legacy-record-1',is_public:1,catalog_no:'EB-MONO-001',title:'기존 공개 도서',
 author:'정찬균',edition:'1판',status:'On Sale',stage:'PUBLISHED',
 isbn_ebook:'978-0-00000-000-0',cover_image:'/books/legacy.jpg',
 detail_url:'/books/legacy',price_krw:9900,
 format_json:'["EPUB 3"]',
 links_json:'{"upaper":"https://example.com/current","merchant":"books"}',
 distribution_json:'{"stores":["books","mall"],"edition":1}',
});
const candidate=(old=existing())=>({
 catalogNo:old.catalog_no,title:old.title,author:old.author,edition:old.edition,
 status:old.status,stage:old.stage,isbnEbook:old.isbn_ebook,
 coverImage:old.cover_image,detailUrl:old.detail_url,priceKrw:old.price_krw,
 formatJson:old.format_json,linksJson:old.links_json,
 distributionJson:old.distribution_json,isPublic:true,
});
test('generic Books admin creates cannot publish a new edition directly',()=>{
 assert.equal(genericAdminPublicMutationAllowed(null,candidate()),false);
 assert.equal(genericAdminPublicMutationAllowed(null,{...candidate(),isPublic:false}),true);
 assert.equal(genericAdminPublicMutationAllowed({is_public:0},candidate()),false);
});
test('previously public books can keep existing publication state unchanged',()=>{
 const row=existing();
 assert.equal(genericAdminPublicMutationAllowed(row,candidate(row)),true);
 const reordered={...candidate(row),
   linksJson:'{"merchant":"books","upaper":"https://example.com/current"}'};
 assert.equal(genericAdminPublicMutationAllowed(row,reordered),true);
 assert.equal(genericAdminPublicMutationAllowed(row,{...candidate(row),isPublic:false}),true);
});
test('public edition cannot silently swap price, file links, metadata or current release status',()=>{
 const row=existing();const common=candidate(row);
 for(const replacement of [
   {priceKrw:0},{title:'other title'},{catalogNo:'EB-MONO-NEW'},
   {author:'different person'},{status:'PENDING'},{stage:'REVIEW'},
   {formatJson:'["PDF"]'},{linksJson:'{"upaper":"https://example.com/malicious"}'},
   {distributionJson:'{"stores":["unknown"]}'},
   {isbnEbook:'other'},{coverImage:'/books/fake.jpg'},{detailUrl:'/other'},
 ]){
   assert.equal(genericAdminPublicMutationAllowed(row,{...common,...replacement}),false,
     JSON.stringify(replacement));
 }
});
test('malformed retained public asset pointers deny the edit instead of matching NULL',()=>{
 const row=existing();row.links_json='not json';
 assert.equal(genericAdminPublicMutationAllowed(row,{...candidate(row),linksJson:'not json'}),false);
});
test('unpublishing a public book allows correction but re-publication requires publisher release',()=>{
 const row=existing();const toPrivate={...candidate(row),isPublic:false,title:'corrected'};
 assert.equal(genericAdminPublicMutationAllowed(row,toPrivate),true);
 assert.equal(genericAdminPublicMutationAllowed({...row,is_public:0},
   {...toPrivate,isPublic:true}),false);
});
test('Books API uses the protected admin transition on both create and update',()=>{
 const source=readFileSync(new URL('../books-control.js',import.meta.url),'utf8');
 assert.match(source,/import \{ genericAdminPublicMutationAllowed \} from/);
 const calls=source.match(/if\(!genericAdminPublicMutationAllowed\(/g)||[];
 assert.equal(calls.length,2);
 assert.match(source,/BOOK_RELEASE_APPROVAL_REQUIRED/);
});
