const params=new URLSearchParams(location.search);
const marketing=params.get('site')==='marketing';
const reviewMode=params.get('review')==='1';
const explicitPro=params.get('plan')==='pro'||params.get('intent')==='pro';

if(marketing&&!reviewMode&&!explicitPro){
  const badge=document.getElementById('serviceBadge');
  const accessStatus=document.getElementById('accessStatus');
  const requestActions=document.getElementById('requestActions');
  const freeActions=document.getElementById('freeActions');
  const continueFree=document.getElementById('continueFree');
  let redirectScheduled=false;

  const safeReturn=()=>{
    try{
      const fallback='https://marketing.ekodi.kr/';
      const target=new URL(params.get('return_to')||fallback);
      const allowed=['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr'];
      return target.protocol==='https:'&&allowed.includes(target.origin)?target.href:fallback;
    }catch{return 'https://marketing.ekodi.kr/'}
  };

  const applyFreeFirstExperience=()=>{
    if(badge?.textContent.trim()!=='무료회원')return;
    requestActions?.classList.add('hide');
    freeActions?.classList.remove('hide');
    if(continueFree)continueFree.textContent='마케팅AI 무료로 시작하기';
    if(accessStatus){
      accessStatus.textContent='무료회원 가입이 완료되었습니다. 먼저 마케팅AI 무료 기능을 편하게 사용해 보세요. 필요한 고급 기능은 실제 사용 과정에서 자연스럽게 안내합니다.';
      accessStatus.className='notice';
    }
    if(!redirectScheduled){
      redirectScheduled=true;
      window.setTimeout(()=>{
        const target=new URL(safeReturn());
        target.searchParams.set('welcome','free');
        location.assign(target.href);
      },900);
    }
  };

  const observer=new MutationObserver(applyFreeFirstExperience);
  if(badge)observer.observe(badge,{childList:true,subtree:true,characterData:true});
  if(accessStatus)observer.observe(accessStatus,{childList:true,subtree:true,characterData:true});
  applyFreeFirstExperience();
}
