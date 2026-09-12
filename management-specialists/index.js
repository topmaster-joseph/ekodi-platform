export * from './menu.js';
export * from './order.js';
export * from './review.js';

export const SPECIALIST_CONTRACTS=Object.freeze({
  menu:Object.freeze({id:'menu',version:1,owns:['menu','channel-menu-mapping'],reads:['product'],externalWrites:['publish','change_price'],defaultExternalAdapterState:'disabled'}),
  order:Object.freeze({id:'order',version:1,owns:['order'],reads:['menu'],externalWrites:['external_order_mutation','delivery_dispatch'],defaultExternalAdapterState:'disabled'}),
  review:Object.freeze({id:'review',version:1,owns:['review'],reads:['business','store'],externalWrites:['publish'],defaultExternalAdapterState:'disabled'})
});

export function specialistContract(id){
  return SPECIALIST_CONTRACTS[String(id||'').trim().toLowerCase()]||null;
}
