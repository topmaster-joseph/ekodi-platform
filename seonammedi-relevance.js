// Public automatic publication requires the article headline AND the
// source's own content to discuss the regional medical-school project.
// Search query labels and publisher names do not qualify as article evidence.
const REGION=/(?:서남권|전남|전라남도|목포|순천|광주|무안|신안|영암|해남|진도|완도|나주|여수|고흥|보성|장흥|강진|함평|영광|장성|화순|담양|곡성|구례)/i;
const MEDICAL_PROJECT=/(?:국립\s*의대|국립\s*의과\s*대학|공공\s*의대|공공\s*의과\s*대학|(?:의대|의과\s*대학)\s*(?:신설|설립|유치|건립|통합|후보|선정|공모|평가|추진|정원|배정|재검토|협의|확충)|(?:통합|신설|설립|유치|공공|후보|선정|추진)\s*(?:의대|의과\s*대학))/i;

export function hasRegionalMedicalContext(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  return text.length>=8&&REGION.test(text)&&MEDICAL_PROJECT.test(text);
}

export function isPublicSeonamMediSource(item){
  if(!item||['rejected','archived'].includes(item.review_state))return false;
  // An editor may approve a source after checking the actual publication.
  if(item.review_state==='verified')return true;
  // A search result or a description from a blog is not a confirmed news article.
  // A snippet is NOT evidence of visiting the source. Only a durable publisher-page
  // verification marker (or separate editor approval above) permits auto-publication.
  if(item.source_verified!==1&&item.source_verified!==true)return false;
  if(item.source_type!=='news'||!hasRegionalMedicalContext(item.title)||!hasRegionalMedicalContext(item.summary_text))return false;
  try{
    const url=new URL(String(item.resolved_url||item.url||''));
    return url.protocol==='https:'&&url.hostname!=='news.google.com'&&url.hostname!=='www.google.com';
  }catch{return false}
}
