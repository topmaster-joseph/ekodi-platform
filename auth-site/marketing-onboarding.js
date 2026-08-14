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
    if(continueFree)continueFree.textContent='무료 기능 바로 체험하기';
    if(accessStatus){
      accessStatus.textContent='무료회원 가입이 완료되었습니다. 결제 안내 없이 바로 마케팅AI 무료 체험 화면으로 이동합니다.';
      accessStatus.className='notice';
    }
    if(!redirectScheduled){
      redirectScheduled=true;
      window.setTimeout(goFree,700);
    }
  };

  const observer=new MutationObserver(applyFreeFirstExperience);
  if(badge)observer.observe(badge,{childList:true,subtree:true,characterData:true});
  if(accessStatus)observer.observe(accessStatus,{childList:true,subtree:true,characterData:true});
  applyFreeFirstExperience();
}
