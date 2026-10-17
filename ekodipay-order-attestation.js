// Server-only proof of an authorized issuer order. No PG calls or money movement.
const verified=new WeakMap(),validModes=new Set(['test','live']);
const KEYS=['source','approved','orderId','merchantId','service','issuerRef','issuerProofRef','amount','currency','approvedAt','expiresAt'];
export function issuerOrderCanonicalPayload(o,{mode,nonce}={}){
 if(!o||typeof o!=='object'||Array.isArray(o)||!validModes.has(mode)||!(/^[A-Za-z0-9_-]{16,96}$/).test(nonce||''))
   throw Error('invalid_issuer_payload');
 return JSON.stringify(['EKODIPAY_APPROVED_ORDER_V1',mode,nonce,...KEYS.map(k=>o[k]??null)]);
}
function signatureBytes(s){
 if(typeof s!=='string'||!(/^[A-Za-z0-9_-]{43}$/).test(s))return null;
 try{const bin=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'=');return bin.length===32?Uint8Array.from(bin,c=>c.charCodeAt(0)):null;}
 catch{return null;}
}
export async function authenticateIssuerOrder({order,mode,nonce,signature,issuerSecret,now=Date.now()}={}){
 if(!validModes.has(mode)||!Number.isSafeInteger(now)||now<=0||
    !(issuerSecret instanceof Uint8Array)||issuerSecret.byteLength<32||
    !Number.isSafeInteger(order?.approvedAt)||!Number.isSafeInteger(order?.expiresAt)||
    order.approvedAt>now||order.approvedAt<now-86400000||order.expiresAt<=now||
    order.expiresAt>order.approvedAt+86400000||
    order.source!=='trusted_order_issuer'||order.approved!==true)
   return {ok:false,reason:'issuer_attestation_invalid'};
 const sig=signatureBytes(signature);
 if(!sig)return {ok:false,reason:'issuer_signature_missing_or_invalid'};
 let input;try{input=issuerOrderCanonicalPayload(order,{mode,nonce})}catch{return {ok:false,reason:'issuer_attestation_invalid'};}
 const key=await crypto.subtle.importKey('raw',issuerSecret,{name:'HMAC',hash:'SHA-256'},false,['verify']).catch(()=>null);
 if(!key)return {ok:false,reason:'issuer_key_unavailable'};
 const ok=await crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode(input)).catch(()=>false);
 if(!ok)return {ok:false,reason:'issuer_signature_mismatch'};
 const record=Object.freeze(Object.fromEntries(KEYS.map(k=>[k,order[k]])));
 verified.set(record,mode);
 // The caller must also verify server-side issuer identity, immutable order
 // storage and durable nonce/idempotency before using any PG payment endpoint.
 // WeakMap is a capability check, NOT a replay-prevention ledger.
 return {ok:true,order:record};
}
export function hasVerifiedIssuerOrder(o,mode){return !!o&&typeof o==='object'&&verified.get(o)===mode}
