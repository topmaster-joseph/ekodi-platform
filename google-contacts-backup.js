// Server-only encrypted, owner-bound contact snapshot. Storage/key lifecycle are injected.
const enc=new TextEncoder(), dec=new TextDecoder();
const fail=code=>{throw Object.assign(new Error(code),{code})};
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=256;
function encode64(b){let binary='';for(let i=0;i<b.length;i+=8192)binary+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(binary)}
function decode64(v){return Uint8Array.from(atob(v),c=>c.charCodeAt(0))}
function aad(context){
  if(!context||!['ownerId','googleSubject','operationId','keyId'].every(k=>validId(context[k]))||!/^people\/c[\w-]+$/.test(context.resourceName||''))fail('BACKUP_CONTEXT_REQUIRED');
  return enc.encode(JSON.stringify(['ekodi-contacts-snapshot-v1',context.ownerId,context.googleSubject,context.operationId,context.keyId,context.resourceName]));
}
function validateKey(key){if(key?.type!=='secret'||key.algorithm?.name!=='AES-GCM'||key.algorithm.length!==256||key.extractable||!key.usages.includes('encrypt')||!key.usages.includes('decrypt'))fail('BACKUP_KEY_REQUIRED')}
function validateSnapshot(person,context){if(person?.resourceName!==context.resourceName||!person.metadata?.sources?.some(s=>s.type==='CONTACT'&&s.id&&s.etag))fail('BACKUP_CONTACT_REQUIRED')}
export async function sealContactSnapshot(key,context,person){
  const additionalData=aad(context);validateKey(key);validateSnapshot(person,context);
  const plain=enc.encode(JSON.stringify(person));if(plain.length>2*1024*1024)fail('BACKUP_TOO_LARGE');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,plain);
  return {version:1,keyId:context.keyId,iv:encode64(iv),ciphertext:encode64(new Uint8Array(ciphertext))};
}
export async function openContactSnapshot(key,context,envelope){
  const additionalData=aad(context);validateKey(key);
  if(envelope?.version!==1||envelope.keyId!==context.keyId||typeof envelope.iv!=='string'||envelope.iv.length!==16||typeof envelope.ciphertext!=='string'||envelope.ciphertext.length>2800000)fail('BACKUP_INVALID');
  let person;try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(envelope.iv),additionalData},key,decode64(envelope.ciphertext));person=JSON.parse(dec.decode(plain))}catch{fail('BACKUP_AUTHENTICATION_FAILED')}
  validateSnapshot(person,context);return person;
}
