// Server-side HMAC identifier for a PG merchant's registered settlement bank account.
// Use only with a private 256-bit+ key from an approved secret manager.
// Never store or log the raw account number in EKODI's public data plane.
export async function fingerprintSettlementAccount({bankCode,accountNumber,hmacKey}={}){
 if(typeof bankCode!=='string'||!(/^[A-Z0-9]{2,12}$/).test(bankCode)||
   typeof accountNumber!=='string'||!(/^[0-9-]{7,30}$/).test(accountNumber)||
   !(hmacKey instanceof Uint8Array)||hmacKey.byteLength<32)
   throw Error('invalid_private_bank_fingerprint_input');
 const digits=accountNumber.replace(/-/g,'');
 if(!(/^[0-9]{7,24}$/).test(digits))throw Error('invalid_private_bank_account_format');
 const key=await crypto.subtle.importKey('raw',hmacKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const input=new TextEncoder().encode('EKODIPAY_BANK_ACCOUNT_V1|'+bankCode+'|'+digits);
 const raw=new Uint8Array(await crypto.subtle.sign('HMAC',key,input));
 const fingerprint=Array.from(raw,byte=>byte.toString(16).padStart(2,'0')).join('');
 return Object.freeze({bankCode,accountLast4:digits.slice(-4),fingerprint});
}
