// Books admin/publication boundary: legacy public records can be maintained,
// but the generic admin API cannot create a NEW public publication or silently
// replace the commercial identity/price/outbound links of a public edition.
// Future releases must be activated through the publisher-authenticated process.
const deepValue=v=>{
  if(Array.isArray(v))return v.map(deepValue);
  if(v&&typeof v==='object')return Object.fromEntries(
    Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>[k,deepValue(val)]));
  return v;
};
const parse=s=>{try{return deepValue(JSON.parse(s||'{}'));}catch{return null;}};
const equalJson=(oldValue,newValue)=>{
  const original=parse(oldValue),candidate=parse(newValue);
  return original!==null && candidate!==null &&
    JSON.stringify(original)===JSON.stringify(candidate);
};
const same=(a,b)=>String(a??'')===String(b??'');

/**
 * Only allows a public admin edit when existing public material-identifying
 * fields remain unchanged. A new public record or private->public transition
 * must use an independently authenticated publisher release workflow.
 * This does NOT authorize a public release. It restricts generic admin writes.
 */
export function genericAdminPublicMutationAllowed(existing,candidate){
  if(candidate?.isPublic!==true)return true; // private staging / takedown allowed
  if(!existing || existing.is_public!==1 && existing.is_public!==true)return false;
  const immutable=[
    ['catalog_no','catalogNo'],['title','title'],['author','author'],
    ['edition','edition'],['status','status'],['stage','stage'],
    ['isbn_ebook','isbnEbook'],['cover_image','coverImage'],
    ['detail_url','detailUrl'],['price_krw','priceKrw'],
  ];
  if(immutable.some(([key,next])=>!same(existing[key],candidate[next])))return false;
  if(!equalJson(existing.format_json,candidate.formatJson))return false;
  if(!equalJson(existing.links_json,candidate.linksJson))return false;
  if(!equalJson(existing.distribution_json,candidate.distributionJson))return false;
  return true;
}
