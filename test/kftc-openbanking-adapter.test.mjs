import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encryptKftcCredential,decryptKftcCredential,kftcStateHash} from '../money/kftc-credential-vault.js';
import {normalizeKftcSync} from '../kftc-openbanking-adapter-worker.js';

test('KFTC credentials are AES-GCM encrypted and state is one-way hashed',async()=>{
  const env={KFTC_CREDENTIAL_KEY:'unit-test-only'};
  const value={accessToken:'secret-access',fintechUseNum:'123456789012345678901234',scope:'inquiry'};
  const encrypted=await encryptKftcCredential(env,value);
  assert.notEqual(encrypted.ciphertext,value.accessToken);
  assert.equal((await decryptKftcCredential(env,{credential_ciphertext:encrypted.ciphertext,credential_iv:encrypted.iv})).fintechUseNum,value.fintechUseNum);
  assert.notEqual(await kftcStateHash('state-value'),'state-value');
});

test('KFTC response normalization matches Finance BANKING_READER contract',()=>{
  const normalized=normalizeKftcSync(
    {rsp_code:'A0000',bank_rsp_code:'000',balance_amt:'1000000',available_amt:'900000'},
    {rsp_code:'A0000',bank_rsp_code:'000',api_tran_id:'api-1',balance_amt:'1000000',res_list:[
      {tran_date:'20260928',tran_time:'103000',inout_type:'입금',tran_type:'타행환',printed_content:'입금',tran_amt:'450000',after_balance_amt:'1000000'}
    ]}
  );
  assert.equal(normalized.account.balance,1000000);
  assert.equal(normalized.account.availableBalance,900000);
  assert.equal(normalized.transactions.length,1);
  assert.equal(normalized.transactions[0].direction,'in');
  assert.equal(normalized.transactions[0].amount,450000);
});

test('KFTC adapter is read-only, fail-closed, and stores no plaintext provider credential columns',async()=>{
  const [worker,migration,config,manifest]=await Promise.all([
    readFile(new URL('../kftc-openbanking-adapter-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../migrations/20260928_kftc_openbanking_read_adapter.sql',import.meta.url),'utf8'),
    readFile(new URL('../wrangler.kftc-openbanking.toml',import.meta.url),'utf8'),
    readFile(new URL('../deploy/manifests/kftc-openbanking-adapter.worker.json',import.meta.url),'utf8')
  ]);
  assert.match(worker,/financialExecution:false/);
  assert.match(worker,/transferExecution:false/);
  assert.match(worker,/rawAccountNumberCollection:false/);
  assert.match(worker,/KFTC_OPENBANKING_LIVE_READ_ENABLED/);
  assert.match(worker,/KFTC_INTERNAL_SERVICE_TOKEN/);
  assert.doesNotMatch(worker,/transfer\/deposit|transfer\/withdraw/);
  assert.match(migration,/credential_ciphertext TEXT NOT NULL/);
  assert.match(migration,/credential_iv TEXT NOT NULL/);
  assert.doesNotMatch(migration,/access_token\s+TEXT|refresh_token\s+TEXT|fintech_use_num\s+TEXT|account_num\s+TEXT/i);
  assert.match(config,/KFTC_OPENBANKING_CONTRACT_APPROVED = "false"/);
  assert.match(config,/KFTC_OPENBANKING_LIVE_READ_ENABLED = "false"/);
  assert.doesNotMatch(config,/KFTC_OPENBANKING_CLIENT_SECRET\s*=/);
  const parsed=JSON.parse(manifest);assert.equal(parsed.worker.name,'ekodi-kftc-openbanking-adapter');
});
