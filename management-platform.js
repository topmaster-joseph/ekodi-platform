export const MANAGEMENT_WORKSPACE_TYPES=Object.freeze([
  Object.freeze({id:'person',canonicalKind:'person',label:'개인'}),
  Object.freeze({id:'business',canonicalKind:'business',label:'사업자·매장'}),
  Object.freeze({id:'institution',canonicalKind:'organization',label:'기관'}),
  Object.freeze({id:'community',canonicalKind:'community',label:'단체'}),
  Object.freeze({id:'project',canonicalKind:'project',label:'프로젝트'}),
  Object.freeze({id:'franchise',canonicalKind:'organization',label:'프랜차이즈'})
]);
export const MANAGEMENT_WORKSPACE_KINDS=Object.freeze([...new Set(MANAGEMENT_WORKSPACE_TYPES.map(item=>item.canonicalKind))]);
export const MANAGEMENT_TIERS=Object.freeze(['free','basic','pro','business']);

const MODULES=[
  {id:'chief',name:'경영비서AI',phase:1,state:'foundation',role:'orchestrator'},
  {id:'marketing',name:'마케팅AI',phase:1,state:'existing',role:'specialist',url:'https://ekodi.kr/ekodibiz/marketing-ai',reuseExisting:true},
  {id:'menu',name:'메뉴AI',phase:1,state:'foundation',role:'specialist'},
  {id:'order',name:'주문AI',phase:1,state:'foundation',role:'specialist'},
  {id:'review',name:'리뷰AI',phase:1,state:'foundation',role:'specialist'},
  {id:'customer',name:'고객AI',phase:1,state:'planned',role:'specialist'},
  {id:'sales',name:'매출AI',phase:1,state:'planned',role:'specialist'},
  {id:'inventory',name:'재고AI',phase:2,state:'planned',role:'specialist'},
  {id:'delivery',name:'배달AI',phase:2,state:'planned',role:'specialist'},
  {id:'settlement',name:'정산AI',phase:2,state:'planned',role:'specialist'},
  {id:'staff',name:'직원AI',phase:2,state:'planned',role:'specialist'},
  {id:'booking',name:'예약AI',phase:2,state:'planned',role:'specialist'}
];

export const MANAGEMENT_MODULES=Object.freeze(MODULES.map(item=>Object.freeze({...item})));
export const MANAGEMENT_MODULE_BY_ID=new Map(MANAGEMENT_MODULES.map(item=>[item.id,item]));

export const MANAGEMENT_ACCESS_POLICY=Object.freeze({
  guestMode:'guide-only',identityProvider:'google',authHub:'https://auth.ekodi.kr/',minimumTier:'free',tierAndModulesIndependent:true,moduleSelectionAtEveryTier:true,providerIndependentCore:true,sharedShellRequired:true,highImpactActionsRequireHumanApproval:true
});

export function workspaceType(value){
  const id=String(value||'').trim().toLowerCase();
  return MANAGEMENT_WORKSPACE_TYPES.find(item=>item.id===id)||MANAGEMENT_WORKSPACE_TYPES[0];
}
export function normalizeWorkspaceKind(value){return workspaceType(value).canonicalKind;}
export function normalizeTier(value){const tier=String(value||'').trim().toLowerCase();return MANAGEMENT_TIERS.includes(tier)?tier:'free';}
export function selectedModules(ids=[]){const requested=new Set((Array.isArray(ids)?ids:[]).map(id=>String(id||'').trim().toLowerCase()));return MANAGEMENT_MODULES.filter(module=>requested.has(module.id));}
export function entitlementPreview({tier='free',selectedModuleIds=[]}={}){const normalizedTier=normalizeTier(tier);const selected=selectedModules(selectedModuleIds);return Object.freeze({tier:normalizedTier,selectedModules:selected.map(module=>module.id),selectableModules:MANAGEMENT_MODULES.map(module=>module.id),principle:'base-tier + selected-modules + usage',selectionBlockedByTier:false});}
export function workspaceContext({id='',type='person',parentId=null,role='member',capabilities=[]}={}){
  const cleanId=String(id||'').trim();if(!cleanId)throw new TypeError('workspace id is required');const profile=workspaceType(type);
  return Object.freeze({id:cleanId,type:profile.id,kind:profile.canonicalKind,parentId:parentId?String(parentId):null,role:String(role||'member').trim().toLowerCase()||'member',capabilities:Object.freeze([...new Set((Array.isArray(capabilities)?capabilities:[]).map(value=>String(value||'').trim()).filter(Boolean))])});
}
export function moduleCanMutateExternalState(moduleId,action,{humanApproved=false,adapterEnabled=false}={}){
  if(!MANAGEMENT_MODULE_BY_ID.has(String(moduleId||'').toLowerCase()))return{allowed:false,reason:'unknown_module'};const highImpact=new Set(['publish','change_price','send_message','refund','external_order_mutation','delivery_dispatch']);if(highImpact.has(String(action||'').toLowerCase())&&!humanApproved)return{allowed:false,reason:'human_approval_required'};if(!adapterEnabled)return{allowed:false,reason:'official_adapter_disabled'};return{allowed:true,reason:'approved_adapter'};
}
