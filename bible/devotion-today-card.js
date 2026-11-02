// EKODI-TODAY-DEVOTION: one public day + one Bible API for Church, Mission and Bible.
// No local, site-specific devotional copy or unpublished day fallback.
function seoulTodayDate(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=key=>parts.find(x=>x.type===key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function devotionalUrl(site,date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('invalid_date');
  if(site==='church')return '/ekodichurch/devotion/?date='+date;
  if(site==='mission')return '/ekodimission/devotion?date='+date;
  return '/bible/devotion/'+date;
}
function normalize(data,date){
  if(!data?.found || data.date!==date || !data.passage || !data.activities?.keyLine)return null;
  return {date,passage:String(data.passage).trim(),keyLine:String(data.activities.keyLine).trim(),
    title:'오늘의 매일묵상'};
}
function fillCard(card,entry){
  const site=card.dataset.ekodiTodayDevotion;
  const label=card.querySelector('[data-devotion-title]');
  const date=card.querySelector('[data-devotion-date]');
  const passage=card.querySelector('[data-devotion-passage]');
  const keyLine=card.querySelector('[data-devotion-keyline]');
  const link=card.matches('a[href]')?card:card.querySelector('[data-devotion-link]');
  if(label)label.textContent=entry.title;
  if(date)date.textContent=entry.date;
  if(passage)passage.textContent=entry.passage;
  if(keyLine)keyLine.textContent=entry.keyLine;
  if(link)link.setAttribute('href',devotionalUrl(site,entry.date));
  card.dataset.devotionReady='true';
}
async function loadTodayCards({doc=document,fetchImpl=fetch,now=new Date()}={}){
  const cards=Array.from(doc.querySelectorAll('[data-ekodi-today-devotion]'));
  if(!cards.length)return false;
  const date=seoulTodayDate(now);
  try{
    const response=await fetchImpl('/bible/api/bible/devotion?date='+encodeURIComponent(date),{
      headers:{accept:'application/json'},cache:'no-store',credentials:'omit'
    });
    if(!response.ok)return false;
    const entry=normalize(await response.json(),date);
    if(!entry)return false;
    cards.forEach(card=>fillCard(card,entry));
    return true;
  }catch{return false;}
}
export {seoulTodayDate,devotionalUrl,normalize,fillCard,loadTodayCards};
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void loadTodayCards(),{once:true});
  else void loadTodayCards();
}
