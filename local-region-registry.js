const OPERATOR_ROLES=Object.freeze({
  lead:'lead_operator',
  co:'co_operator',
  reviewer:'reviewer',
  publisher:'publisher',
  viewer:'viewer',
});

const CHEONGGYE_MODULES=Object.freeze([
  {id:'directory',label:'기관·단체·지역안내',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'commerce',label:'상점·상권',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'commerce-pass',label:'청계패스·지역상품권',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional',financialMode:'external-settlement-required'},
  {id:'events',label:'지역행사·프로그램',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'jobs',label:'구인구직',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'sharing',label:'나눔마켓',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'broadcast',label:'지역방송·라이브',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
  {id:'proposals',label:'주민참여·제안',leadOperatorId:'cgma',operatorIds:['cgma'],publishScope:'regional'},
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

export function localRegionBySlug(slug){
  return REGIONS[String(slug||'').trim().toLowerCase()]||null;
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
