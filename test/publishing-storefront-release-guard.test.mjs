import test from 'node:test';
import assert from 'node:assert/strict';
import { existingEditionAllowed, newEditionPointer, publisherAuthorizedForChannel } from '../publishing/human/storefront-release-guard.js';
import { directSaleBook, authorizedPublicSaleBook } from '../books-commerce.js';

const D='sha256:'+'f'.repeat(64);
const newBook={
  id:'BOOK-EKODI-NEW-003',title:'새로운 희년신학',author:'정찬균',
  status:'On Sale',published:true,
  directSale:{enabled:true},listPrice:{amount:9900},
  publisherRelease:{publicationId:'pub-jubilee-003',editionId:'edition-003',releaseDigest:D,
    approved:true,checkoutEnabled:true},
};
const cat={books:[newBook]};
const live=channel=>({verifyPublicRelease:async req=>({
  authorized:true,state:'released',visibility:'public',checkoutEnabled:true,
  ...req,channel,
})});
test('only matching pre-existing catalogue identities remain in legacy sale lane',async()=>{
  assert.equal(existingEditionAllowed({
    id:'BOOK-EKODI-000001',title:'에코디언을 찾아서',author:'정찬균',catalogNo:'EB-MONO-001'}),true);
  assert.equal(existingEditionAllowed({
    id:'BOOK-EKODI-000002',title:'AI 시대의 진보와 빈곤',author:'정찬균',catalogNo:'EB-MONO-002'}),true);
  assert.equal(existingEditionAllowed({...newBook,id:'BOOK-EKODI-000001'}),false);
  assert.equal(existingEditionAllowed(newBook),false);
  assert.equal(existingEditionAllowed({id:'BOOK-EKODI-000001',catalogNo:'EB-MONO-001',
    title:'에코디언을 찾아서',author:'정찬균',publisherRelease:newBook.publisherRelease}),false);
  assert.equal(existingEditionAllowed({id:'BOOK-EKODI-000001',catalogNo:'EB-MONO-001',
    title:'에코디언을 찾아서',author:'정찬균',
    directSale:{enabled:true,fileKey:'BOOK-EKODI-NEW-003/ebook.epub'}}),false);
});
test('new private JSON entry cannot self-authorize checkout without publisher RPC',async()=>{
  assert.equal(directSaleBook(cat,newBook.id),newBook,'admin may stage EPUB but not sell');
  assert.equal(await authorizedPublicSaleBook({},cat,newBook.id),null);
  assert.equal(await authorizedPublicSaleBook({
    PUBLISHING_RELEASE_GATE:{verifyPublicRelease:async()=>({authorized:true})},
  },cat,newBook.id),null);
  assert.equal(await authorizedPublicSaleBook({PUBLISHING_RELEASE_GATE:live('books')},cat,newBook.id),newBook);
});
test('release service must attest matching channel, digest, edition and status',async()=>{
  assert.equal(newEditionPointer(newBook).releaseDigest,D);
  assert.equal(await publisherAuthorizedForChannel(live('ekodimall'),newBook,'books'),false);
  assert.equal(await publisherAuthorizedForChannel(live('books'),newBook,'ekodimall'),false);
  for(const replacement of [
    {editionId:'other-edition'},{releaseDigest:'sha256:'+'e'.repeat(64)},
    {publicationId:'other-publication'},{state:'scheduled'},{visibility:'private'},
    {checkoutEnabled:false},{authorized:false},
  ]){
    const gate={verifyPublicRelease:async req=>({
      authorized:true,state:'released',visibility:'public',checkoutEnabled:true,...req,...replacement,
    })};
    assert.equal(await publisherAuthorizedForChannel(gate,newBook,'books'),false,
      JSON.stringify(replacement));
  }
  assert.equal(await publisherAuthorizedForChannel({
    verifyPublicRelease:async()=>{throw Error('publisher offline');},
  },newBook,'books'),false);
});
test('malformed pointers and custom approval flags never authorize release',async()=>{
  const supplied={...newBook,publisherRelease:{
    editionId:'edition-003',publicationId:'pub-jubilee-003',
    releaseDigest:'sha256:UNVERIFIED',approved:true,
  }};
  assert.equal(newEditionPointer(supplied),null);
  assert.equal(await publisherAuthorizedForChannel(live('books'),supplied,'books'),false);
  assert.equal(await publisherAuthorizedForChannel(live('books'),newBook,'unknown'),false);
  assert.equal(await publisherAuthorizedForChannel(null,newBook,'books'),false);
});

test('owner-approved English edition passes the publisher gate only with its exact identity',async()=>{
  const en={id:'BOOK-EKODI-000003',title:'In Search of the EKODIan',author:'Jeong Chan Gyun',catalogNo:'EB-MONO-001-EN',
    directSale:{enabled:true,fileKey:'BOOK-EKODI-000003/ebook.epub'}};
  assert.equal(existingEditionAllowed(en),true);
  assert.equal(existingEditionAllowed({...en,title:'Something Else'}),false);
  assert.equal(existingEditionAllowed({...en,directSale:{enabled:true,fileKey:'BOOK-EKODI-000001/ebook.epub'}}),false);
  assert.equal(existingEditionAllowed({...en,publisherRelease:newBook.publisherRelease}),false);
});
