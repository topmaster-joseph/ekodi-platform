// Server-only read adapter. Caller must resolve owner-bound OAuth token from vault.
export const GOOGLE_CONTACTS_READ_SCOPE='https://www.googleapis.com/auth/contacts.readonly';
export const GOOGLE_CONTACTS_WRITE_SCOPE='https://www.googleapis.com/auth/contacts';
const ENDPOINT='https://people.googleapis.com/v1/people/me/connections';
export const SCAN_FIELDS='metadata,names,organizations,emailAddresses,phoneNumbers';
function failure(code,status) { return Object.assign(new Error(code),{code,status}); }
export async function listGoogleContactsForReview({accessToken,fetchImpl=fetch,signal,maxPages=1000}={}) {
  if(typeof accessToken!=='string'||!accessToken.trim()||/[\r\n]/.test(accessToken)) throw failure('CONTACTS_AUTH_REQUIRED',401);
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>1000) throw failure('INVALID_PAGE_LIMIT',400);
  const people=[], seenPages=new Set(), seenPeople=new Set();
  let token='';
  for(let count=0;count<maxPages;count++) {
    const url=new URL(ENDPOINT);
    url.searchParams.set('personFields',SCAN_FIELDS);
    url.searchParams.set('sources','READ_SOURCE_TYPE_CONTACT');
    url.searchParams.set('pageSize','1000');
    if(token) url.searchParams.set('pageToken',token);
    const res=await fetchImpl(url.toString(),{method:'GET',headers:{authorization:'Bearer '+accessToken,accept:'application/json'},redirect:'error',cache:'no-store',signal});
    if(!res.ok) throw failure(res.status===401||res.status===403?'CONTACTS_AUTH_REQUIRED':res.status===429?'CONTACTS_RATE_LIMITED':'CONTACTS_PROVIDER_ERROR',res.status);
    const page=await res.json();
    if(!page||typeof page!=='object'||(page.connections!==undefined&&!Array.isArray(page.connections))) throw failure('CONTACTS_INVALID_RESPONSE',502);
    for(const p of page.connections||[]) {
      if(!p?.metadata?.sources?.some(s=>s.type==='CONTACT')||!/^people\/c[\w-]+$/.test(p.resourceName||'')||seenPeople.has(p.resourceName)) throw failure('CONTACTS_INCONSISTENT_SCAN',409);
      seenPeople.add(p.resourceName); people.push(p);
    }
    token=page.nextPageToken||'';
    if(!token) return people;
    if(typeof token!=='string'||seenPages.has(token)) throw failure('CONTACTS_PAGINATION_LOOP',502);
    seenPages.add(token);
  }
  throw failure('CONTACTS_SCAN_INCOMPLETE',409);
}
