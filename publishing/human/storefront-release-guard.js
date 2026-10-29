// EKODI Orchestrator: fail-closed approval boundary for NEW publishing editions.
// Legacy catalogue entries retain existing sales, but a new JSON field cannot
// self-authorize an unscheduled, unapproved, cancelled or embargoed edition.
// Only a trusted publisher service-binding may verify the release, at request time.
export const EXISTING_BOOKSTORE_EDITION_IDENTITIES=Object.freeze({
  'BOOK-EKODI-000001':Object.freeze({title:'에코디언을 찾아서',author:'정찬균'}),
  'BOOK-EKODI-000002':Object.freeze({title:'AI 시대의 진보와 빈곤',author:'정찬균'}),
});
const SHA=/^sha256:[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{2,159}$/;
const CHANNELS=new Set(['books','ekodimall']);

export function existingEditionAllowed(book){
  const approved=EXISTING_BOOKSTORE_EDITION_IDENTITIES[book?.id];
  return Boolean(approved&&book.title===approved.title&&book.author===approved.author);
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
      proof.editionId===pointer.editionId&&proof.releaseDigest===pointer.releaseDigest;
  }catch{return false;}
}
