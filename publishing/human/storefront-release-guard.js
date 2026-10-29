// 출판 -> Books/Mall: secure storefront visibility boundary.
// Static JSON metadata and browser-supplied flags are NEVER publication authorization.
// Only authenticated, publisher-owned runtime verification may unlock NEW editions.
// The two previously published catalogue entries retain their pre-existing behavior.
export const LEGACY_BOOKS_CATALOG = Object.freeze({
  'BOOK-EKODI-000001': Object.freeze({title:'에코디언을 찾아서',author:'정찬균'}),
  'BOOK-EKODI-000002': Object.freeze({title:'AI 시대의 진보와 빈곤',author:'정찬균'}),
});
export const RELEASE_CHANNELS = Object.freeze(['books','ekodimall']);
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const text=x=>typeof x==='string'&&x.trim().length>0;

export function isExistingBookstoreEdition(book){
  const reference=LEGACY_BOOKS_CATALOG[book?.id];
  return Boolean(reference && book.title===reference.title && book.author===reference.author);
}
/** The release identity is a public pointer, never evidence of approval. */
export function candidateReleasePointer(book) {
  const p=book?.publisherRelease;
  if(!p || !text(book?.id) || !ID.test(p.publicationId||'') ||
      !ID.test(p.editionId||'') || !DIGEST.test(p.releaseDigest||''))return null;
  // No self-supplied `approved` or `published` fields are considered here.
  return Object.freeze({publicationId:p.publicationId,editionId:p.editionId,releaseDigest:p.releaseDigest});
}
/** Only usable by trusted server-side publishing RPC; not a client-side call. */
export async function verifyNewEditionVisibility(binding,book,channel) {
  if(!RELEASE_CHANNELS.includes(channel))return false;
  if(isExistingBookstoreEdition(book))return true;
  const pointer=candidateReleasePointer(book);
  if(!pointer || typeof binding?.verifyPublicRelease!=='function')return false;
  try{
    const result=await binding.verifyPublicRelease({...pointer,channel});
    return result?.authorized===true &&
      result.state==='released'&&result.visibility==='public'&&result.checkoutEnabled===true &&
      result.channel===channel&&result.publicationId===pointer.publicationId &&
      result.editionId===pointer.editionId&&result.releaseDigest===pointer.releaseDigest;
  }catch{return false;}
}
/** Fail closed on new/static items when no verified publisher binding is available. */
export function isLegacyVisibleInStaticStorefront(book) {
  return isExistingBookstoreEdition(book);
}
