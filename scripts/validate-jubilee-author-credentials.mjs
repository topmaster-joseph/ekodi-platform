// No account IDs or emails are committed to the repository.
// These values arrive exclusively as protected GitHub Actions secrets.
import { pathToFileURL } from 'node:url';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

export function validateJubileeAuthorBindings(ownerValue,aliasesValue){
  const owner=String(ownerValue||'').trim();
  if(!UUID.test(owner))throw Error('JUBILEE_PRIMARY_UUID_INVALID');
  const raw=String(aliasesValue||'');
  if(!raw||raw.length>2048)throw Error('JUBILEE_ALIASES_MISSING_OR_OVERSIZED');
  let aliases;
  try{aliases=JSON.parse(raw)}catch{throw Error('JUBILEE_ALIASES_JSON_INVALID')}
  if(!Array.isArray(aliases)||aliases.length!==2)throw Error('JUBILEE_TWO_ALIASES_REQUIRED');
  const ids=new Set([owner.toLowerCase()]),emails=new Set();
  for(const entry of aliases){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||
       Object.keys(entry).sort().join(',')!=='email,userId')
      throw Error('JUBILEE_ALIAS_FIELDS_INVALID');
    const {userId,email}=entry;
    if(typeof userId!=='string'||!UUID.test(userId)||
       typeof email!=='string'||!EMAIL.test(email)||
       email!==email.toLowerCase()||email!==email.trim())
      throw Error('JUBILEE_ALIAS_IDENTITY_INVALID');
    if(ids.has(userId.toLowerCase())||emails.has(email))
      throw Error('JUBILEE_ALIAS_DUPLICATED');
    ids.add(userId.toLowerCase());emails.add(email);
  }
  return {owner,aliases};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  validateJubileeAuthorBindings(
    process.env.PUBLISHING_JUBILEE_AUTHOR_USER_ID,
    process.env.PUBLISHING_JUBILEE_AUTHOR_ALIASES
  );
  process.stdout.write('JUBILEE_BINDING_CONTRACT_VALID: 1 primary, 2 linked accounts (values redacted)\n');
}
