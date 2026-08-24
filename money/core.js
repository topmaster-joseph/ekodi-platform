export const MONEY_STAGES = Object.freeze(['discover','review','plan','confirm','handoff','verify']);

const HIGH_IMPACT_ACTIONS = new Set(['transfer-balance','close-account','change-autopay','cancel-autopay','close-card','payment','withdraw','sign']);

function days(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0}
function money(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0}
function list(value){return Array.isArray(value)?value:[]}

export function requiresHumanGate(action){return HIGH_IMPACT_ACTIONS.has(String(action||'').toLowerCase())}

export function normalizeAccount(account={}){
  return {
    id:String(account.id||''),
    institution:String(account.institution||''),
    alias:String(account.alias||'계좌'),
    balance:money(account.balance),
    inactiveDays:days(account.inactiveDays),
    autoDebits:list(account.autoDebits).map(item=>({name:String(item?.name||'자동이체'),amount:money(item?.amount)})),
    linkedLoan:Boolean(account.linkedLoan),
    linkedCard:Boolean(account.linkedCard),
    restricted:Boolean(account.restricted),
    primary:Boolean(account.primary),
    userMarkedKeep:Boolean(account.userMarkedKeep)
  };
}

export function classifyAccount(input){
  const account=normalizeAccount(input);
  const relationships=account.autoDebits.length+Number(account.linkedLoan)+Number(account.linkedCard);
  if(account.restricted) return {status:'attention',reason:'제한·특수관계 가능성이 있어 금융기관 확인이 필요합니다.',account};
  if(account.primary||account.userMarkedKeep) return {status:'keep',reason:'주거래 또는 사용자가 유지로 지정한 계좌입니다.',account};
  if(account.linkedLoan) return {status:'attention',reason:'대출 연결 가능성이 있어 해지 전 확인이 필요합니다.',account};
  if(account.inactiveDays>=365&&relationships===0) return {status:'cleanup',reason:'1년 이상 미사용이며 감지된 연결관계가 없습니다.',account};
  if(account.inactiveDays>=180||relationships===0) return {status:'review',reason:'사용 빈도 또는 연결관계를 다시 확인할 가치가 있습니다.',account};
  return {status:'keep',reason:'현재 사용 또는 자동납부 연결이 감지됩니다.',account};
}

export function buildCleanupPlan(accounts=[],targetAccountId=''){
  const normalized=accounts.map(normalizeAccount);
  const target=normalized.find(a=>a.id===targetAccountId)||normalized.find(a=>a.primary)||null;
  const findings=normalized.map(classifyAccount);
  const steps=[];
  for(const finding of findings){
    const a=finding.account;
    if(!['cleanup','review'].includes(finding.status)) continue;
    for(const debit of a.autoDebits){
      steps.push({accountId:a.id,type:'change-autopay',label:`${a.institution} ${a.alias}의 ${debit.name} 출금계좌 변경`,humanGateRequired:true,reason:'계좌 해지 전에 자동납부 연결을 먼저 안전하게 이전합니다.'});
    }
    if(a.balance>0&&target&&target.id!==a.id){
      steps.push({accountId:a.id,type:'transfer-balance',label:`${a.institution} ${a.alias} 잔액 ${a.balance.toLocaleString('ko-KR')}원 이전`,humanGateRequired:true,reason:`사용자가 확인한 ${target.institution} ${target.alias}로 이전 후보입니다.`});
    }
    if(finding.status==='cleanup'){
      steps.push({accountId:a.id,type:'close-account',label:`${a.institution} ${a.alias} 해지 검토`,humanGateRequired:true,reason:'최종 해지 가능 여부는 공인 금융기관 채널에서 확인하고 승인해야 합니다.'});
    }
  }
  return {targetAccountId:target?.id||null,findings,steps,executionMode:'human-confirmed-handoff',autonomousFinancialExecution:false};
}

export function summarizePortfolio(accounts=[]){
  const findings=accounts.map(classifyAccount);
  const totals=findings.reduce((acc,item)=>{acc[item.status]=(acc[item.status]||0)+1;acc.balance+=item.account.balance;acc.autoDebits+=item.account.autoDebits.length;return acc},{keep:0,review:0,cleanup:0,attention:0,balance:0,autoDebits:0});
  return {...totals,accounts:findings.length,actionable:totals.review+totals.cleanup+totals.attention};
}

export function buildFinancialCleanupBrief(accounts=[],targetAccountId=''){
  const summary=summarizePortfolio(accounts);
  const plan=buildCleanupPlan(accounts,targetAccountId);
  const top=plan.findings.filter(x=>x.status!=='keep').slice(0,3).map(x=>({id:x.account.id,status:x.status,reason:x.reason,label:`${x.account.institution} ${x.account.alias}`}));
  return {summary,top,plan,disclaimer:'EKODI Money는 금융정리 판단과 순서를 돕습니다. 이체·해지·자동이체 변경은 사용자의 명시적 승인과 공인 금융기관 절차를 거쳐야 합니다.'};
}
