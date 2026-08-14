const params=new URLSearchParams(location.search);
const marketing=params.get('site')==='marketing';
const reviewMode=params.get('review')==='1';

if(marketing&&!reviewMode){
  const badge=document.getElementById('serviceBadge');
  const accessStatus=document.getElementById('accessStatus');
  const requestActions=document.getElementById('requestActions');
  const freeActions=document.getElementById('freeActions');
  const continueFree=document.getElementById('continueFree');

  const freeTarget=()=>{
    try{
      const fallback='https://marketing.ekodi.kr/';
      const target=new URL(params.get('return_to')||fallback);
      const allowed=['https://marketing.ekodi.kr','https://jadam.ekodi.kr','https://pizzamaru.ekodi.kr','https://yogurt.ekodi.kr'];
      const safe=target.protocol==='https:'&&allowed.includes(target.origin)?target:new URL(fallback);
      if(safe.origin==='https://marketing.ekodi.kr'){
        safe.searchParams.set('welcome','free');
        safe.hash='memberTrial';
      }
      return safe.href;
    }catch{return 'https://marketing.ekodi.kr/?welcome=free#memberTrial'}
  };

  const goFree=()=>location.assign(freeTarget());

  if(continueFree){
    continueFree.addEventListener('click',event=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      goFree();
    },true);
  }

  const applyFreeFirstExperience=()=>{
    if(badge?.textContent.trim()!=='무료회원')return;
    requestActions?.classList.add('hide');
    freeActions?.classList.remove('hide');
    if(continueFree)continueFree.textContent='FREE로 계속 이용하기';
    if(accessStatus){
      accessStatus.textContent='Google 로그인이 완료되었습니다. FREE로 계속하거나 아래에서 FLEX·PLUS·PRO·AUTO 중 필요한 이용방식을 직접 선택할 수 있습니다.';
      accessStatus.className='notice';
    }
  };

  const observer=new MutationObserver(applyFreeFirstExperience);
  if(badge)observer.observe(badge,{childList:true,subtree:true,characterData:true});
  if(accessStatus)observer.observe(accessStatus,{childList:true,subtree:true,characterData:true});
  applyFreeFirstExperience();
}
