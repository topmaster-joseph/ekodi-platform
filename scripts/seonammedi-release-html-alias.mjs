// EKODI strict released-HTML comparer for the customer-domain Cloudflare
// pathname alias. Every byte must be identical except removal of an approved
// "/seonammedi/" prefix inside href/src attributes for published assets.
export function compareSeonamMediPublishedHtml(expected,actual,allowlistedPaths=[]){
  if(typeof expected!=='string'||typeof actual!=='string')return {matched:false,aliases:[],reason:'invalid_html'};
  const allowed=new Set(allowlistedPaths);
  let i=0,j=0;const aliases=[];
  while(i<expected.length&&j<actual.length){
    // Recognize a strict path alias before byte equality: a rewritten
    // /seonammedi/shared-... and /shared-... both start with "s".
    const attributePrefix=expected.slice(Math.max(0,i-80),i);
    const permittedAttribute=/(?:\bsrc|\bhref)=["']\/$/.test(attributePrefix);
    if(permittedAttribute&&expected.startsWith('seonammedi/',i)
      &&expected.slice(i+11,i+31)===actual.slice(j,j+20)){
      const path=expected.slice(i+11).match(/^([^"'<>\s?#]+)/)?.[1]||'';
      if(!allowed.has(path))return {matched:false,aliases,reason:'unapproved_domain_alias:'+path};
      aliases.push(path);
      i+=11; // Customer host has already emitted the shared slash.
      continue;
    }
    if(expected[i]===actual[j]){i++;j++;continue}
    return {matched:false,aliases,reason:'unexpected_html_difference',expectedOffset:i,actualOffset:j};
  }
  if(i!==expected.length||j!==actual.length)
    return {matched:false,aliases,reason:'different_html_length',expectedOffset:i,actualOffset:j};
  return {matched:true,aliases,reason:'exact_or_approved_path_aliases_only'};
}
