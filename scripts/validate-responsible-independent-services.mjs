import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const failures=[];
const fail=message=>failures.push(message);
const contract=readJson('governance/architecture/responsible-independent-service-contract.v1.json');
const architecture=readJson('governance/architecture/ekodi-os-architecture.json');
const serviceDir=path.join(root,'governance/services');
const files=fs.existsSync(serviceDir)?fs.readdirSync(serviceDir).filter(name=>name.endsWith('.service.json')):[];

if(contract.status!=='enforced-foundation')fail('responsible independent service contract must be enforced-foundation');
if(contract.invariants?.responsibilityClass!=='ekodi-responsible')fail('reference contract responsibility class mismatch');
if(!files.length)fail('at least one responsible independent service manifest is required');

for(const file of files){
  const rel=`governance/services/${file}`;
  const service=readJson(rel);
  for(const key of contract.required||[])if(service[key]===undefined)fail(`${rel}: missing ${key}`);
  if(service.responsibilityClass!=='ekodi-responsible')fail(`${rel}: responsibilityClass must be ekodi-responsible`);
  if(service.serviceBoundary?.failureIsolation!==true)fail(`${rel}: failure isolation must be declared`);
  if(service.serviceBoundary?.extractable!==true)fail(`${rel}: extraction readiness must be declared`);
  if(service.identity?.serviceDoesNotOwnCanonicalIdentity!==true)fail(`${rel}: service must not own canonical identity`);
  if(service.identity?.workspaceIdNeverDerivedFromUrl!==true)fail(`${rel}: workspace identity must not derive from URL`);
  if(service.dataBoundary?.crossServicePrivateDatabaseAccess!==false)fail(`${rel}: cross-service private DB access must be false`);
  if(service.lifecycle?.disconnectSafe!==true)fail(`${rel}: disconnectSafe must be true`);
  if(service.lifecycle?.exportSupported!==true)fail(`${rel}: exportSupported must be true`);
  if(service.lifecycle?.providerReplacementSupported!==true)fail(`${rel}: provider replacement path must exist`);
  if(service.actionPolicy?.defaultMaximum!=='L2')fail(`${rel}: default autonomous ceiling must remain L2`);
  if(service.actionPolicy?.financialExecutionEnabled!==false)fail(`${rel}: financial execution must remain disabled by default`);
  if(service.actionPolicy?.irreversibleAutonomousExecution!==false)fail(`${rel}: irreversible autonomous execution must be false`);
  if(service.projectionPolicy?.userMayRevoke!==true)fail(`${rel}: projected sharing must be revocable`);
  if(service.providerStrategy?.externalProviderPrivateDbAccess!==false)fail(`${rel}: external providers may not access private service DB`);
  if(service.evidencePolicy?.insightRequiresEvidence!==true)fail(`${rel}: AI advice must be evidence-linked`);

  const capability=service.serviceBoundary?.architectureCapability;
  const boundary=architecture.platformBoundaryClassification?.[capability];
  if(!boundary)fail(`${rel}: architecture capability ${capability} is not registered`);
  else {
    if(boundary.layer!=='responsible-independent-service')fail(`${rel}: ${capability} must remain a responsible-independent-service`);
    if(boundary.responsibilityClass!=='ekodi-responsible')fail(`${rel}: ${capability} responsibility mismatch`);
  }
}

const pf=files.includes('personal-finance-ai.service.json')?readJson('governance/services/personal-finance-ai.service.json'):null;
if(!pf)fail('personal-finance-ai must be the reference Responsible Independent Service');
else {
  if(pf.referenceService!==true)fail('personal-finance-ai referenceService must be true');
  if(pf.dataBoundary?.databaseBinding!=='PERSONAL_DB')fail('personal-finance-ai must use PERSONAL_DB');
  if(pf.dataBoundary?.databaseName!=='ekodi-personal-finance')fail('personal-finance-ai must own ekodi-personal-finance data boundary');
  if(pf.connections?.ekodiCrossServiceDefault!=='insight-only-projection')fail('personal-finance cross-service default must be insight-only-projection');
  if(pf.surfaceComposition?.publicMoneySurface?.privateFinanceDataAccess!==false)fail('public Money surface must not receive private finance data access');
  if(pf.adjacentServices?.lifeAiMoneyTopic?.privateFinanceDataAccess!==false)fail('Life AI money topic must not receive private finance DB access');
}

const pfWrangler=fs.readFileSync(path.join(root,'wrangler.personal-finance.toml'),'utf8');
const moneyWrangler=fs.readFileSync(path.join(root,'wrangler.money.toml'),'utf8');
const lifeWrangler=fs.readFileSync(path.join(root,'wrangler.life.toml'),'utf8');
if(!pfWrangler.includes('binding = "PERSONAL_DB"')||!pfWrangler.includes('database_name = "ekodi-personal-finance"'))fail('Personal Finance must own its dedicated PERSONAL_DB binding');
if(moneyWrangler.includes('PERSONAL_DB'))fail('public Money surface must not bind the private Personal Finance database');
if(lifeWrangler.includes('PERSONAL_DB'))fail('Life AI must not bind the private Personal Finance database');

if(failures.length){
  console.error(`Responsible Independent Service validation failed (${failures.length})`);
  failures.forEach(message=>console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Responsible Independent Service contract OK: ${files.length} service manifest(s)`);
console.log('- Personal Finance AI is the reference EKODI Responsible Independent Service');
console.log('- canonical identity stays in Core; private finance data stays in the finance boundary');
console.log('- public Money and Life AI stay outside the private finance database');
console.log('- autonomous financial execution ceiling remains L2; L3/L4 require separate approval policy');
console.log('- cross-service sharing defaults to revocable, purpose-bound insight projection');
