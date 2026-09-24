const encoder=new TextEncoder();
const decoder=new TextDecoder();

const SECRET_KINDS=new Set(['password','recovery_code','api_key','totp_seed','secure_note']);

function b64url(bytes){
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function fromB64url(value){
  const normal=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const binary=atob(normal+'='.repeat((4-normal.length%4)%4));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function sha256(value){
  return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(String(value))));
}
function kekMaterial(env){return String(env?.PERSONAL_CREDENTIAL_VAULT_KEK||'').trim()}
function kekVersion(env){return String(env?.PERSONAL_CREDENTIAL_VAULT_KEK_VERSION||'1').trim().slice(0,40)||'1'}
export function personalCredentialVaultReady(env){return Boolean(kekMaterial(env))}
async function kek(env){
  if(!kekMaterial(env))throw Object.assign(new Error('PERSONAL_CREDENTIAL_VAULT_KEK_MISSING'),{code:'PERSONAL_CREDENTIAL_VAULT_KEK_MISSING'});
  const raw=await sha256(`ekodi:personal-credential:kek:v1:${kekVersion(env)}:${kekMaterial(env)}`);
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
function aadText(parts){return parts.map(value=>String(value??'')).join('|')}
function ensureKind(kind){
  const value=String(kind||'').trim();
  if(!SECRET_KINDS.has(value))throw Object.assign(new Error('PERSONAL_CREDENTIAL_SECRET_KIND_INVALID'),{code:'PERSONAL_CREDENTIAL_SECRET_KIND_INVALID'});
  return value;
}
export function generatePersonalVaultKey(){return crypto.getRandomValues(new Uint8Array(32))}
export async function wrapPersonalVaultKey(env,{ownerPersonId,vaultId,dek}){
  if(!(dek instanceof Uint8Array)||dek.byteLength!==32)throw new Error('PERSONAL_CREDENTIAL_DEK_INVALID');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const version=kekVersion(env);
  const aad=encoder.encode(aadText(['ekodi-personal-vault-key','v1',ownerPersonId,vaultId,version]));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await kek(env),dek));
  return {wrappedKey:b64url(cipher),iv:b64url(iv),keyVersion:version,aad:b64url(aad)};
}
export async function unwrapPersonalVaultKey(env,{ownerPersonId,vaultId,wrappedKey,iv,keyVersion}){
  if(String(keyVersion||'')!==kekVersion(env))throw Object.assign(new Error('PERSONAL_CREDENTIAL_KEK_VERSION_MISMATCH'),{code:'PERSONAL_CREDENTIAL_KEK_VERSION_MISMATCH'});
  const aad=encoder.encode(aadText(['ekodi-personal-vault-key','v1',ownerPersonId,vaultId,keyVersion]));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(iv),additionalData:aad},await kek(env),fromB64url(wrappedKey));
  const dek=new Uint8Array(plain);
  if(dek.byteLength!==32)throw new Error('PERSONAL_CREDENTIAL_DEK_INVALID');
  return dek;
}
async function dataKey(dek){
  if(!(dek instanceof Uint8Array)||dek.byteLength!==32)throw new Error('PERSONAL_CREDENTIAL_DEK_INVALID');
  return crypto.subtle.importKey('raw',dek,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptPersonalVaultSecret(dek,{ownerPersonId,vaultId,itemId,kind,value,schemaVersion=1}){
  const secretKind=ensureKind(kind);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const aad=encoder.encode(aadText(['ekodi-personal-vault-item',schemaVersion,ownerPersonId,vaultId,itemId,secretKind]));
  const plain=encoder.encode(JSON.stringify({value:String(value??'')}));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await dataKey(dek),plain));
  return {ciphertext:b64url(cipher),iv:b64url(iv),aad:b64url(aad),schemaVersion,kind:secretKind};
}
export async function decryptPersonalVaultSecret(dek,{ownerPersonId,vaultId,itemId,kind,ciphertext,iv,schemaVersion=1}){
  const secretKind=ensureKind(kind);
  const aad=encoder.encode(aadText(['ekodi-personal-vault-item',schemaVersion,ownerPersonId,vaultId,itemId,secretKind]));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(iv),additionalData:aad},await dataKey(dek),fromB64url(ciphertext));
  const parsed=JSON.parse(decoder.decode(plain));
  return String(parsed?.value??'');
}
export async function personalVaultLookupHash(value){
  return b64url(await sha256(`ekodi:personal-credential:lookup:v1:${String(value||'').trim().toLowerCase()}`));
}
export const PERSONAL_CREDENTIAL_VAULT_CRYPTO=Object.freeze({
  contract:'ekodi.personal-credential-vault.crypto.v1',
  cipher:'AES-256-GCM',
  nonceBytes:12,
  envelopeEncryption:true,
  perPersonDek:true,
  allowedSecretKinds:Object.freeze([...SECRET_KINDS]),
  oauthTokensStoredHere:false,
  passkeyPrivateKeysStoredHere:false,
});
