// EKODI Orchestrator: fail-closed approval boundary for NEW publishing editions.
// Legacy catalogue entries retain existing sales, but a new JSON field cannot
// self-authorize an unscheduled, unapproved, cancelled or embargoed edition.
// Only a trusted publisher service-binding may verify the release, at request time.
export const EXISTING_BOOKSTORE_EDITION_IDENTITIES=Object.freeze({
  'BOOK-EKODI-000001':Object.freeze({title:'에코디언을 찾아서',author:'정찬균',
    catalogNo:'EB-MONO-001',fileKey:'BOOK-EKODI-000001/ebook.epub'}),
  'BOOK-EKODI-000002':Object.freeze({title:'AI 시대의 진보와 빈곤',author:'정찬균',
    catalogNo:'EB-MONO-002',fileKey:'BOOK-EKODI-000002/ebook.epub'}),
});
// Human Gate record (not self-authorizing JSON): the author/publisher explicitly approved this
// edition in the EKODI operator conversation on 2026-11-01. Sale still requires the bookstore
// readiness gate (validated EPUB, live storefront) and the uploaded file.
export const HUMAN_APPROVED_BOOKSTORE_EDITIONS=Object.freeze({
  'BOOK-EKODI-000003':Object.freeze({title:'In Search of the EKODIan',author:'Jeong Chan Gyun',
    catalogNo:'EB-MONO-001-EN',fileKey:'BOOK-EKODI-000003/ebook.epub',
    approvedBy:'정찬균 (저자·발행인)',approvedAt:'2026-11-01'}),
});
const SHA=/^sha256:[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const CHANNELS=new Set(['books','ekodimall']);

// Exact signed product binding: an approved edition pointer cannot be reused on
// a different catalog row, price, author or downloadable EPUB. This evidence
// comes from the private Publisher verifier, never from the browser JSON alone.
const BOOK_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const CATALOG_NO=/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
function signedRetailIdentityMatches(proof,book){
  if(proof?.retailIdentityVersion!==1 || !BOOK_ID.test(book?.id||'') ||
     !CATALOG_NO.test(book?.catalogNo||'') ||
     !book?.title || !book?.author || !book?.directSale?.fileKey ||
     !book.directSale.fileKey.startsWith(book.id+'/') ||
     book.directSale.fileKey.includes('..') ||
     !book.directSale.fileKey.endsWith('.epub') ||
     book?.listPrice?.currency!=='KRW' ||
     !Number.isSafeInteger(book.listPrice.amount) || book.listPrice.amount<=0)
    return false;
  return proof.bookId===book.id && proof.catalogNo===book.catalogNo &&
    proof.title===book.title && proof.author===book.author &&
    proof.fileKey===book.directSale.fileKey &&
    proof.priceKrw===book.listPrice.amount && proof.currency==='KRW';
}

export function existingEditionAllowed(book){
  const approved=EXISTING_BOOKSTORE_EDITION_IDENTITIES[book?.id]||HUMAN_APPROVED_BOOKSTORE_EDITIONS[book?.id];
  return Boolean(approved&&book.title===approved.title&&book.author===approved.author &&
    book.catalogNo===approved.catalogNo && !book.publisherRelease &&
    (!book.directSale?.enabled || book.directSale.fileKey===approved.fileKey));
}
export function newEditionPointer(book) {
  const p=book?.publisherRelease;
  if(!p || !ID.test(p.publicationId||'') || !ID.test(p.editionId||'') ||
      !SHA.test(p.releaseDigest||''))return null;
  return Object.freeze({publicationId:p.publicationId,editionId:p.editionId,
    releaseDigest:p.releaseDigest});
}
/** Caller must supply a server-only service binding. No browser-asserted proof. */
export async function publisherAuthorizedForChannel(binding,book,channel) {
  if(!CHANNELS.has(channel))return false;
  if(existingEditionAllowed(book))return true;
  const pointer=newEditionPointer(book);
  if(!pointer || typeof binding?.verifyPublicRelease!=='function')return false;
  try{
    const proof=await binding.verifyPublicRelease({...pointer,channel});
    return proof?.authorized===true&&proof.state==='released'&&
      proof.visibility==='public'&&proof.checkoutEnabled===true &&
      proof.channel===channel&&proof.publicationId===pointer.publicationId &&
      proof.editionId===pointer.editionId&&proof.releaseDigest===pointer.releaseDigest &&
      signedRetailIdentityMatches(proof,book);
  }catch{return false;}
}
