import { normalizeRegionalCommerceProgramContract } from './regional-commerce-program-contract.js';

const PROGRAMS=Object.freeze({
  'cheonggye-pass':normalizeRegionalCommerceProgramContract({
    id:'cheonggye-pass',
    regionId:'local:cheonggye',
    publicName:'청계패스',
    mode:'hybrid',
    providerId:null,
    providerStatus:'unassigned',
    adapterVersion:'v1',
    publicPath:'/cheonggye/pass',
    adminPath:'/cheonggye/admin/pass',
    capabilities:[
      'catalog',
      'merchant-enrollment',
      'merchant-status',
      'benefit-rules',
      'coupon',
      'points',
      'voucher',
      'transaction-summary',
      'settlement-summary',
      'webhook-events',
      'health',
    ],
  }),
});

export function regionalCommerceProgramById(id){
  return PROGRAMS[String(id||'').trim().toLowerCase()]||null;
}

export function regionalCommerceProgramFromLocalRoute(route){
  if(!route?.region)return null;
  const segments=route.segments||[];
  if(route.admin){
    if(String(segments[1]||'').toLowerCase()!=='pass')return null;
  }else if(String(segments[0]||'').toLowerCase()!=='pass')return null;
  return regionalCommerceProgramById(`${route.region.publicSlug}-pass`);
}

export function regionalCommerceProgramRegistrySnapshot(){
  return Object.freeze(Object.values(PROGRAMS).map(program=>Object.freeze({...program})));
}
