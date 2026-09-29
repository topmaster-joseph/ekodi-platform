import fs from 'node:fs';
function fail(message){console.error('EKODIBIZ membership policy:',message);process.exitCode=1}
const policy=JSON.parse(fs.readFileSync(new URL('../config/ekodibiz-membership-packaging-policy.json',import.meta.url),'utf8'));
if(policy.policyId!=='EKODIBIZ-FREE-TO-PAID-001')fail('policy id changed');
if(policy.status!=='enforced')fail('policy must remain enforced');
if(policy.scope?.appliesTo!=='all_ekodibiz_user_sites_subsites_and_services')fail('child-service inheritance lost');
if(policy.guest?.default!=='safe_public_introduction'||policy.guest?.privateData!==false)fail('guest projection must remain safe and public');
if(policy.freeMember?.default!=='meaningful_core_use')fail('FREE must provide meaningful core use');
if(policy.paidValue?.principle!=='convenience_scale_automation_integration_not_artificial_core_lockout')fail('paid value principle changed');
if(policy.billing?.approvedPriceCatalogRequired!==true||policy.billing?.automaticPaidUpgrade!==false||policy.billing?.explicitConsentRequired!==true)fail('billing guardrails changed');
if(policy.conversion?.darkPatternsForbidden!==true||policy.conversion?.showAtNeedMoment!==true)fail('contextual conversion guardrails changed');
const tax=JSON.parse(fs.readFileSync(new URL('../config/tax-membership-policy.json',import.meta.url),'utf8'));
if(tax.scope?.inheritance!=='all_tax_subpages_and_subservices')fail('Tax child inheritance lost');
if(tax.free?.manualHometaxIssue!==true||tax.free?.automation!==false)fail('Tax FREE fallback changed');
if(tax.paid?.automaticPaidUpgrade!==false||tax.paid?.priceCatalogRequiredBeforeCheckout!==true)fail('Tax billing guardrails changed');
if(!process.exitCode)console.log('EKODIBIZ membership packaging policy: PASS');
