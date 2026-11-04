// DEVOTION-SCRIPTURE-VERSION-001
// Publisher-owned Scripture remains at its official provider. No scraping,
// caching, transcription, synthesis, framing or redistributed copyrighted text.
export const DEVOTION_VERSIONS=Object.freeze([
  {id:'KRV1961',label:'개역한글',mode:'local',publisher:'대한성서공회'},
  {id:'SAE',label:'표준새번역',mode:'official-link',publisher:'대한성서공회'},
  {id:'NIV',label:'NIV',mode:'official-link',publisher:'Biblica / YouVersion'},
]);
export const isDevotionVersion=value=>DEVOTION_VERSIONS.some(item=>item.id===value);
const passagePart=data=>(data?.scripture||[]).find(part=>part?.book?.id&&Number.isInteger(Number(part?.chapter)));
export function officialDevotionPassageUrl(data,version){
  if(version!=='SAE'&&version!=='NIV')return null;
  const part=passagePart(data);
  if(!part)return null;
  const id=String(part.book.id||'').toUpperCase();
  const chapter=Number(part.chapter);
  if(!/^(?:[123])?[A-Z]{2,3}$/.test(id)||!Number.isInteger(chapter)||chapter<1||chapter>150)return null;
  if(version==='NIV')return 'https://www.bible.com/bible/111/'+id+'.'+chapter+'.niv';
  const start=Number(part.verses?.[0]?.verse||1);
  const url=new URL('https://www.bskorea.or.kr/bible/korbibReadpage.php');
  url.searchParams.set('book',id.toLowerCase());
  url.searchParams.set('chap',String(chapter));
  if(Number.isInteger(start)&&start>=1&&start<=176)url.searchParams.set('sec',String(start));
  url.searchParams.set('version','SAE');
  return url.href;
}
export function isApprovedOfficialBibleHost(value){
  try{
    const url=new URL(value);
    return url.protocol==='https:' &&
      (url.hostname==='www.bskorea.or.kr' && url.pathname==='/bible/korbibReadpage.php' ||
       url.hostname==='www.bible.com' && /^\/bible\/111\/[1-3]?[A-Z]{2,3}\.\d{1,3}\.niv$/i.test(url.pathname));
  }catch{return false}
}
