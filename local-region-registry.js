const OPERATOR_ROLES=Object.freeze({
  lead:'lead_operator',
  co:'co_operator',
  reviewer:'reviewer',
  publisher:'publisher',
  viewer:'viewer',
});

const CHEONGGYE_MODULES=Object.freeze([
  {id:'directory',routeSegment:'directory',label:'기관·단체·지역안내',summary:'청계의 기관·단체·대학·생활 안내를 지역 공통정보로 연결합니다.',publicPath:'/cheonggye/directory',adminPath:'/cheonggye/admin/directory',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
  {id:'commerce',routeSegment:'commerce',label:'상점·상권',summary:'상점과 상권의 공개정보를 연결하되 상인회 회원·회비 등 내부정보와 분리합니다.',publicPath:'/cheonggye/commerce',adminPath:'/cheonggye/admin/commerce',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'organization-projection-only',sourceWorkspace:'/cgma'},
  {id:'commerce-pass',routeSegment:'pass',label:'청계패스·지역상품권',summary:'쿠폰·포인트·상권혜택을 지역 공통서비스로 운영하고 현금성 결제·정산 책임은 별도 계약으로 분리합니다.',publicPath:'/cheonggye/pass',adminPath:'/cheonggye/admin/pass',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth',financialMode:'external-settlement-required'},
  {id:'events',routeSegment:'events',label:'지역행사·프로그램',summary:'행사·프로그램·참여신청 정보를 지역 공통일정으로 연결합니다.',publicPath:'/cheonggye/events',adminPath:'/cheonggye/admin/events',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
  {id:'forest',routeSegment:'forest',label:'국민의숲·산림프로젝트',summary:'승달산·목포대와 연결되는 국민의숲 프로젝트의 추진현황과 공개근거를 관리합니다.',publicPath:'/cheonggye/forest',adminPath:'/cheonggye/admin/forest',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-project-ledger'},
  {id:'jobs',routeSegment:'jobs',label:'구인구직',summary:'지역 점포·기관과 주민·학생의 일자리 기회를 연결합니다.',publicPath:'/cheonggye/jobs',adminPath:'/cheonggye/admin/jobs',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
  {id:'sharing',routeSegment:'sharing',label:'나눔마켓',summary:'지역의 물품·재능·공간 나눔과 교환을 연결합니다.',publicPath:'/cheonggye/sharing',adminPath:'/cheonggye/admin/sharing',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
  {id:'broadcast',routeSegment:'broadcast',label:'지역방송·라이브',summary:'상권·주민·대학·행사의 라이브와 지역 콘텐츠를 한곳에 모읍니다.',publicPath:'/cheonggye/broadcast',adminPath:'/cheonggye/admin/broadcast',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
  {id:'proposals',routeSegment:'proposals',label:'주민참여·제안',summary:'주민·학생·상인·기관의 의견과 제안을 접수하고 처리상태를 연결합니다.',publicPath:'/cheonggye/proposals',adminPath:'/cheonggye/admin/proposals',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',dataOwner:'regional-platform',sourcePolicy:'regional-source-of-truth'},
]);

const REGIONS=Object.freeze({
  cheonggye:Object.freeze({
    id:'local:cheonggye',
    publicSlug:'cheonggye',
    siteSubject:'local-cheonggye',
    name:'청계',
    brand:'청계잇다',
    publicPath:'/cheonggye',
    adminPath:'/cheonggye/admin',
    ownership:'regional-platform',
    governanceModel:'delegated-multi-operator',
    initialOperatorId:'cgma',
    operators:Object.freeze({
      cgma:Object.freeze({
        id:'cgma',
        name:'청계면상인회',
        kind:'merchant-association',
        tenantSlug:'cgma',
        publicPath:'/cgma',
        adminPath:'/cgma/admin',
        role:OPERATOR_ROLES.lead,
        status:'active',
        operatingRights:Object.freeze({
          scope:'all-region-modules',
          moduleIds:Object.freeze(CHEONGGYE_MODULES.map(module=>module.id)),
          accessMode:'delegated-operations',
          accessManagement:'explicit-region-grant-only',
          canCoOperate:true,
          canReceiveTransfer:true,
        }),
      }),
    }),
    modules:CHEONGGYE_MODULES,
    transferPolicy:Object.freeze({
      dataMovement:'none',
      preserveAuditHistory:true,
      allowPerModuleTransfer:true,
      allowCoOperation:true,
      overlapHandover:true,
      ownerAfterTransfer:'regional-platform',
    }),
  }),
});

function cleanPath(pathname){
  const raw=String(pathname||'').split(/[?#]/)[0];
  return raw.startsWith('/')?raw:`/${raw}`;
}

export function validateLocalRegionContract(region){
  if(!region||!region.id||!region.publicPath||!region.adminPath)throw new Error('LOCAL_REGION_CONTRACT_INVALID');
  const publicPaths=new Set();
  const adminPaths=new Set();
  const moduleIds=new Set();
  for(const module of region.modules||[]){
    if(!module?.id||!module.routeSegment||!module.label||!module.summary||!module.publicPath||!module.adminPath||!module.leadOperatorId||!Array.isArray(module.operatorIds)||!module.publishScope||!module.dataOwner||!module.sourcePolicy){
      throw new Error('LOCAL_REGION_MODULE_CONTRACT_INVALID:'+String(module?.id||'unknown'));
    }
    if(moduleIds.has(module.id)||publicPaths.has(module.publicPath)||adminPaths.has(module.adminPath))throw new Error('LOCAL_REGION_MODULE_ROUTE_DUPLICATE:'+module.id);
    if(module.publicPath!==region.publicPath+'/'+module.routeSegment)throw new Error('LOCAL_REGION_PUBLIC_ROUTE_INVALID:'+module.id);
    if(module.adminPath!==region.adminPath+'/'+module.routeSegment)throw new Error('LOCAL_REGION_ADMIN_ROUTE_INVALID:'+module.id);
    if(!region.operators?.[module.leadOperatorId]||!module.operatorIds.includes(module.leadOperatorId))throw new Error('LOCAL_REGION_LEAD_OPERATOR_INVALID:'+module.id);
    for(const operatorId of module.operatorIds){
      if(!region.operators?.[operatorId])throw new Error('LOCAL_REGION_OPERATOR_UNKNOWN:'+module.id+':'+operatorId);
    }
    moduleIds.add(module.id);publicPaths.add(module.publicPath);adminPaths.add(module.adminPath);
  }
  for(const operator of Object.values(region.operators||{})){
    for(const moduleId of operator?.operatingRights?.moduleIds||[]){
      if(!moduleIds.has(moduleId))throw new Error('LOCAL_REGION_OPERATOR_SCOPE_UNKNOWN:'+moduleId);
    }
  }
  return true;
}

export function localRegionBySlug(slug){
  const region=REGIONS[String(slug||'').trim().toLowerCase()]||null;
  if(region)validateLocalRegionContract(region);
  return region;
}

export function localRegionModuleById(regionOrSlug,moduleId){
  const region=typeof regionOrSlug==='string'?localRegionBySlug(regionOrSlug):regionOrSlug;
  if(!region)return null;
  validateLocalRegionContract(region);
  return region.modules.find(module=>module.id===String(moduleId||'').trim().toLowerCase())||null;
}

export function localRegionModuleFromRoute(route){
  if(!route?.region)return null;
  validateLocalRegionContract(route.region);
  const index=route.admin?1:0;
  const segment=String(route.segments?.[index]||'').trim().toLowerCase();
  if(!segment)return null;
  return route.region.modules.find(module=>module.routeSegment===segment)||null;
}

export function localRegionFromPath(pathname){
  const path=cleanPath(pathname);
  const parts=path.split('/').filter(Boolean);
  const region=localRegionBySlug(parts[0]);
  if(!region)return null;
  const segments=parts.slice(1);
  const admin=segments[0]?.toLowerCase()==='admin';
  return Object.freeze({
    region,
    admin,
    segments:Object.freeze(segments),
    subpath:segments.join('/'),
  });
}

export function isLocalRegionPath(pathname){
  return Boolean(localRegionFromPath(pathname));
}

export function localRegionRegistrySnapshot(){
  return Object.freeze(Object.values(REGIONS).map(region=>Object.freeze({
    id:region.id,
    publicSlug:region.publicSlug,
    siteSubject:region.siteSubject,
    name:region.name,
    brand:region.brand,
    publicPath:region.publicPath,
    adminPath:region.adminPath,
    ownership:region.ownership,
    governanceModel:region.governanceModel,
    initialOperatorId:region.initialOperatorId,
    operators:Object.freeze(Object.values(region.operators).map(operator=>Object.freeze({...operator}))),
    modules:Object.freeze(region.modules.map(module=>Object.freeze({...module,operatorIds:Object.freeze([...module.operatorIds])}))),
    transferPolicy:region.transferPolicy,
  })));
}

export { OPERATOR_ROLES };
