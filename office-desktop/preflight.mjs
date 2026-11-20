import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const manifestPath=resolve(dirname(fileURLToPath(import.meta.url)),'rebrand-contract.json');
const HEX40=/^[a-f0-9]{40}$/;
const ID=/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/;
export function validateOfficeDesktopContract(input){
  assert.equal(input?.schemaVersion,1);
  assert.equal(input?.status,'preflight-only-not-a-shipping-app');
  const up=input.upstream,ek=input.ekodi;
  assert.equal(up.repository,'pblsketch/ieumoffice');
  assert.match(up.sha,HEX40);
  assert.equal(up.license,'Apache-2.0');
  assert.equal(up.sourceLicense,'LICENSE');
  assert.equal(up.notice,'NOTICE');
  assert.equal(up.unicodeLicense,'LICENSE-UNICODE.txt');
  assert.match(ek.appId,ID);
  assert.equal(ek.productName,'EKODI Office');
  assert.equal(ek.appId,'kr.ekodi.office');
  assert.equal(ek.packagedName,'ekodi-office');
  assert.equal(ek.exeName,'EKODIOffice');
  assert.notEqual(ek.productName,up.originalIdentity.productName);
  assert.notEqual(ek.appId,up.originalIdentity.appId);
  assert.notEqual(ek.packagedName,up.originalIdentity.packagedName);
  for(const k of ['updateFeedEnabled','fileAssociationChangesEnabled','cloudSyncEnabled','providerCredentialMigrationEnabled','userDataMigrationEnabled','shippingEnabled']){
    assert.equal(ek[k],false,k+' must remain disabled in preflight');
  }
  const mandatory=[
    'preserve-root-LICENSE-and-NOTICE',
    'generate-and-bundle-third-party-notices',
    'preserve-unicode-license',
    'replace-upstream-logos-artwork-and-icon',
    'isolate-Windows-ProgIDs-userData-and-update-cache',
    'disable-upstream-auto-update-feed-before-fork',
    'exclude-enterprise-or-non-OSS-components-until-audited',
    'revalidate-format-compatibility-on-real-Windows-fixtures',
    'verify-owned-code-signing-before-public-release',
    'require-explicit-user-approval-for-document-sync-and-external-AI'
  ];
  for(const item of mandatory)assert.ok(input.obligations.includes(item),'missing '+item);
  return {ok:true,sourceSha:up.sha,shipping:false};
}
function readSource(root,file){
  const base=resolve(root),full=resolve(base,file);
  if(!full.startsWith(base+sep))throw Error('traversal');
  return readFileSync(full,'utf8');
}
export function inspectPristineUpstream(root,input,options={}){
  const report=validateOfficeDesktopContract(input);
  const repo=resolve(root);
  const head=options.headSha||execFileSync('git',['-C',repo,'rev-parse','HEAD'],{encoding:'utf8',timeout:10000}).trim();
  assert.equal(head,input.upstream.sha,'the checkout must be pinned to exact upstream commit');
  const rootPackage=JSON.parse(readSource(repo,'package.json'));
  const shell=JSON.parse(readSource(repo,input.upstream.shellPackage));
  const builder=readSource(repo,input.upstream.builderConfig);
  const license=readSource(repo,input.upstream.sourceLicense);
  const notice=readSource(repo,input.upstream.notice);
  readSource(repo,input.upstream.unicodeLicense);
  assert.equal(rootPackage.license,'Apache-2.0');
  assert.equal(shell.license,'Apache-2.0');
  assert.equal(shell.productName,input.upstream.originalIdentity.productName);
  assert.ok(shell.scripts['dist:win']?.includes('electron-builder --win'),'requires actual Windows packaging');
  assert.match(license,/Apache License/);
  assert.match(notice,/GenOffice/);
  assert.ok(builder.includes(input.upstream.originalIdentity.appId));
  assert.ok(builder.includes(input.upstream.originalIdentity.packagedName));
  assert.ok(builder.includes(input.upstream.originalIdentity.updateOwner));
  assert.ok(builder.includes(input.upstream.originalIdentity.updateRepo));
  return {...report,checkedSource:repo,license:'Apache-2.0',windowsPackagingDeclared:true,installerBuilt:false,identityRebranded:false};
}
const current=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(current){
  try{
    const contract=JSON.parse(readFileSync(manifestPath,'utf8'));
    const sourceRoot=process.argv[2];
    const result=sourceRoot?inspectPristineUpstream(sourceRoot,contract):validateOfficeDesktopContract(contract);
    process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){
    process.stderr.write('EKODI_OFFICE_PREFLIGHT_FAILED: '+error.message+'\n');
    process.exitCode=1;
  }
}
