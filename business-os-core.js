/**
 * Business OS common domain engine. No user state, secrets, I/O or tenant bypass.
 * Reused by the Business OS worker and EKODIBIZ agricultural business units.
 */
export const BUSINESS_OS_CORE_VERSION='1.0.0';
export const BUSINESS_OS_LOOP=Object.freeze(['observe','discern','suggest','approve','act','verify','report']);
export const BUSINESS_OS_STAGE=Object.freeze(['사업검토','시설준비','계약검토','정식·재배','수확·검수','납품·정산']);
const HUMAN_ONLY=new Set(['transfer_money','sign_contract','terminate_employee','bind_insurance','deny_insurance_claim','make_hiring_decision','delete_customer_data','raise_debt','file_tax_return','approve_purchase_contract','approve_delivery_settlement']);
const APPROVAL_REQUIRED=new Set(['send_customer_message','publish_campaign','change_ad_budget','change_price','issue_refund','submit_job_posting','share_customer_data','approve_spending']);
export function businessOsGate(action){
 const key=String(action||'').trim();
 if(!key)return Object.freeze({decision:'blocked',reason:'action_required'});
 if(HUMAN_ONLY.has(key))return Object.freeze({decision:'blocked',reason:'high_impact_human_only'});
 if(APPROVAL_REQUIRED.has(key))return Object.freeze({decision:'human_review',reason:'explicit_human_approval_required'});
 return Object.freeze({decision:'review_required',reason:'unregistered_or_draft_action'});
}
const limited=(value,min,max)=>{
 const n=Number(value);
 return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;
};
export function businessOsBudget(input={}){
 const houses=limited(input.houses,0,100000),sqm=limited(input.sqm,0,1e7);
 const yieldKg=limited(input.yieldKg,0,1e5),acceptance=limited(input.acceptance,0,100);
 const unitPrice=limited(input.unitPrice,0,1e10),capex=limited(input.capex,0,1e15);
 const supplies=limited(input.supplies,0,1e15),labor=limited(input.labor,0,1e15);
 const transport=limited(input.transport,0,1e15),cycles=Math.max(1,limited(input.cycles,1,1000));
 const harvestedKg=houses*sqm*yieldKg;
 const acceptedKg=harvestedKg*acceptance/100;
 const revenue=acceptedKg*unitPrice;
 const operatingCost=supplies+labor+transport;
 const allocatedInvestment=capex/cycles;
 const totalCost=operatingCost+allocatedInvestment;
 return {harvestedKg,acceptedKg,revenue,operatingCost,allocatedInvestment,totalCost,margin:revenue-totalCost,breakEvenUnitPrice:acceptedKg?totalCost/acceptedKg:null,sampleOnly:true};
}
export function businessOsProjectProgress(stage){
 const at=BUSINESS_OS_STAGE.indexOf(String(stage||''));
 return Object.freeze({stage:at>=0?BUSINESS_OS_STAGE[at]:null,completedSteps:Math.max(0,at),steps:BUSINESS_OS_STAGE.length});
}
