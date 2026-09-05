import {moduleCanMutateExternalState} from '../management-platform.js';

const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const won=value=>Math.max(0,Math.round(Number(value)||0));
export const ORDER_STATUSES=Object.freeze(['received','accepted','preparing','ready','out_for_delivery','completed','cancelled']);
const TRANSITIONS=Object.freeze({
  received:['accepted','cancelled'],accepted:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['out_for_delivery','completed','cancelled'],out_for_delivery:['completed','cancelled'],completed:[],cancelled:[]
});

export function normalizeOrder(input={}){
  const id=text(input.id||input.orderId,100);
  if(!id)throw new TypeError('order id is required');
  const status=ORDER_STATUSES.includes(String(input.status||'').toLowerCase())?String(input.status).toLowerCase():'received';
  const lines=Array.isArray(input.lines)?input.lines:[];
  return Object.freeze({
    id,
    source:text(input.source||'direct',60).toLowerCase(),
    externalId:input.externalId?text(input.externalId,120):null,
    status,
    lines:Object.freeze(lines.slice(0,200).map(line=>Object.freeze({
      menuItemId:text(line?.menuItemId||line?.id,80),name:text(line?.name,120),quantity:Math.max(1,Math.round(Number(line?.quantity)||1)),unitPrice:won(line?.unitPrice)
    }))),
    total:won(input.total),
    containsCustomerPii:false,
    sourceRecord:'ekodi-canonical-order'
  });
}

export function transitionOrder(order,nextStatus){
  const current=normalizeOrder(order);const next=String(nextStatus||'').trim().toLowerCase();
  if(!ORDER_STATUSES.includes(next))return Object.freeze({allowed:false,reason:'unknown_status',order:current});
  if(!(TRANSITIONS[current.status]||[]).includes(next))return Object.freeze({allowed:false,reason:'invalid_transition',order:current});
  return Object.freeze({allowed:true,reason:'valid_transition',order:Object.freeze({...current,status:next})});
}

export function externalOrderMutationDecision(options={}){
  return moduleCanMutateExternalState('order','external_order_mutation',options);
}

export function deliveryDispatchDecision(options={}){
  return moduleCanMutateExternalState('order','delivery_dispatch',options);
}
