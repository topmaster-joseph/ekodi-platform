import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerprintSettlementAccount} from '../ekodipay-bank-account-fingerprint.js';

const key=Uint8Array.from({length:32},(_,i)=>i+12);
test('server-only keyed HMAC consistently masks settlement account and never returns raw number',async()=>{
 const a=await fingerprintSettlementAccount({bankCode:'088',accountNumber:'123-4567-8901',hmacKey:key});
 const b=await fingerprintSettlementAccount({bankCode:'088',accountNumber:'12345678901',hmacKey:key});
 assert.deepEqual(a,b);
 assert.equal(a.bankCode,'088');assert.equal(a.accountLast4,'8901');
 assert.match(a.fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(a).includes('12345678901'),false);
 assert.equal(JSON.stringify(a).includes('123-4567'),false);
 assert.notEqual(a.fingerprint,await fingerprintSettlementAccount({bankCode:'004',accountNumber:'12345678901',hmacKey:key}).then(x=>x.fingerprint));
 assert.notEqual(a.fingerprint,await fingerprintSettlementAccount({bankCode:'088',accountNumber:'12345678901',hmacKey:Uint8Array.from({length:32},(_,i)=>i+13)}).then(x=>x.fingerprint));
});
test('reject raw bank account misuse or weak secret material',async()=>{
 for(const options of [
  {bankCode:'088',accountNumber:'*******8901',hmacKey:key},
  {bankCode:'088',accountNumber:'12345678901',hmacKey:new Uint8Array(16)},
  {bankCode:'088',accountNumber:'12345678;DROP',hmacKey:key},
  {bankCode:'088',accountNumber:'123',hmacKey:key},
  {bankCode:'088',accountNumber:'12345678901',hmacKey:'public-key'},
 ]){
  await assert.rejects(()=>fingerprintSettlementAccount(options),/invalid_private_bank/);
 }
});
