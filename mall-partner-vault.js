const encoder=new TextEncoder();
const decoder=new TextDecoder();
const material=env=>String(env.MALL_PARTNER_CREDENTIAL_KEY||'').trim();
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function fromB64url(value){const normal=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const binary=atob(normal+'='.repeat((4-normal.length%4)%4));return Uint8Array.from(binary,c=>c.charCodeAt(0))}
async function sha256(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(String(value))))}
async function aesKey(env){if(!material(env))throw Object.assign(new Error('MALL_PARTNER_CREDENTIAL_KEY_MISSING'),{code:'MALL_PARTNER_CREDENTIAL_KEY_MISSING'});return crypto.subtle.importKey('raw',await sha256(`ekodi-mall-partner-aes-v1:${material(env)}`),'AES-GCM',false,['encrypt','decrypt'])}
export function mallPartnerVaultReady(env){return Boolean(material(env))}
export async function encryptMallPartnerCredential(env,value){const iv=crypto.getRandomValues(new Uint8Array(12));const plain=encoder.encode(JSON.stringify({value:String(value||'')}));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(env),plain));return{ciphertext:b64url(cipher),iv:b64url(iv)}}
export async function decryptMallPartnerCredential(env,row){if(!row?.credential_ciphertext||!row?.credential_iv)return'';const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(row.credential_iv)},await aesKey(env),fromB64url(row.credential_ciphertext));const parsed=JSON.parse(decoder.decode(plain));return String(parsed?.value||'')}
export async function mallPartnerFingerprint(value){const digest=await sha256(JSON.stringify(value));return b64url(digest)}