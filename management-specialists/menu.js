import {moduleCanMutateExternalState} from '../management-platform.js';

const text=(value,max=160)=>String(value??'').trim().slice(0,max);
const won=value=>Math.max(0,Math.round(Number(value)||0));

export function normalizeMenuItem(input={}){
  const id=text(input.id||input.sku,80);
  if(!id)throw new TypeError('menu item id is required');
  const options=Array.isArray(input.options)?input.options:[];
  return Object.freeze({
    id,
    name:text(input.name,120),
    description:text(input.description,500),
    price:won(input.price),
    available:input.available!==false,
    options:Object.freeze(options.slice(0,100).map(option=>Object.freeze({
      id:text(option?.id||option?.name,80),name:text(option?.name,120),priceDelta:won(option?.priceDelta)
    }))),
    source:'ekodi-canonical-menu'
  });
}

export function projectMenuToChannel(item,channel,{externalId=null}={}){
  const canonical=normalizeMenuItem(item);
  return Object.freeze({
    canonicalId:canonical.id,
    channel:text(channel,60).toLowerCase(),
    externalId:externalId?text(externalId,120):null,
    name:canonical.name,
    description:canonical.description,
    price:canonical.price,
    available:canonical.available,
    options:canonical.options,
    mutationState:'draft'
  });
}

export function menuMutationDecision(action,options={}){
  const normalized=String(action||'').trim().toLowerCase().replace(/-/g,'_');
  const policyAction=normalized==='change_price'?'change_price':'publish';
  return moduleCanMutateExternalState('menu',policyAction,options);
}
