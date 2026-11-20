import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {validateOfficeDesktopContract,inspectPristineUpstream} from '../office-desktop/preflight.mjs';

const contract=JSON.parse(readFileSync(new URL('../office-desktop/rebrand-contract.json',import.meta.url),'utf8'));
const make=()=>structuredClone(contract);
test('desktop contract pins upstream and disables shipping before audit',()=>{
 const r=validateOfficeDesktopContract(contract);
 assert.equal(r.ok,true);
 assert.equal(r.shipping,false);
 assert.match(r.sourceSha,/^[a-f0-9]{40}$/);
});
test('identity collisions and migration, sync, update flags fail closed',()=>{
 for(const [field,value] of [
  ['appId',contract.upstream.originalIdentity.appId],
  ['packagedName',contract.upstream.originalIdentity.packagedName],
  ['productName',contract.upstream.originalIdentity.productName],
  ['updateFeedEnabled',true],['fileAssociationChangesEnabled',true],
  ['cloudSyncEnabled',true],['providerCredentialMigrationEnabled',true],
  ['userDataMigrationEnabled',true],['shippingEnabled',true]
 ]){
  const m=make();m.ekodi[field]=value;
  assert.throws(()=>validateOfficeDesktopContract(m),field);
 }
 const m=make();m.upstream.sha='main';
 assert.throws(()=>validateOfficeDesktopContract(m),/40/);
});
test('required license and privacy safeguards cannot be omitted',()=>{
 for(const obligation of contract.obligations){
  const m=make();m.obligations=m.obligations.filter(x=>x!==obligation);
  assert.throws(()=>validateOfficeDesktopContract(m),obligation);
 }
});
test('upstream fixture checks exact revision and reports no installer',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ekodi-office-audit-'));
 const write=(name,value)=>{const target=join(dir,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,value,'utf8');};
 try{
  write('package.json',JSON.stringify({license:'Apache-2.0'}));
  write(contract.upstream.shellPackage,JSON.stringify({license:'Apache-2.0',productName:'IeumOffice',scripts:{'dist:win':'npm run notices && electron-vite build && electron-builder --win'}}));
  write(contract.upstream.builderConfig,"const APP_ID='io.github.pblsketch.ieumoffice';const PACKAGED_APP_NAME='ieumoffice';const REPO_OWNER='pblsketch';const REPO_NAME='ieumoffice';");
  write('LICENSE','Apache License Version 2.0');
  write('NOTICE','GenOffice Copyright');
  write('LICENSE-UNICODE.txt','Unicode License');
  const r=inspectPristineUpstream(dir,contract,{headSha:contract.upstream.sha});
  assert.equal(r.installerBuilt,false);
  assert.equal(r.identityRebranded,false);
  assert.throws(()=>inspectPristineUpstream(dir,contract,{headSha:'0000000000000000000000000000000000000000'}),/exact upstream commit/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
