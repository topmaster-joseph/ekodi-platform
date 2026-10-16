const MODULES=Object.freeze([
  '/my/public-profile.js?v=20260923-public-person-v1',
  '/my/digital-card-admin.js?v=20261008-messenger-share-1',
  '/my/character-identity.js?v=20260906-ekodian-personal-v1',
  '/my/approval-brief.js?v=20260904-approval-hub-1',
  '/my/personal-finance.js?v=20260905-personal-finance-1',
  '/my/life-communication.js?v=20260824-life-ai-1',
]);
const CLASSIC=Object.freeze([
  '/my/church-marketing-ai.js?v=20260827-church-marketing-1',
  '/my/channel-automation.js?v=20260903-channel-automation-1',
]);
let startPromise=null;

function loadClassic(src){
  if(document.querySelector(`script[data-my-secondary-src="${src}"]`))return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.dataset.mySecondarySrc=src;
    script.onload=()=>resolve();
    script.onerror=()=>reject(new Error(`secondary_script_failed:${src}`));
    document.head.append(script);
  });
}
export function loadMySecondaryFeatures(){
  if(startPromise)return startPromise;
  startPromise=Promise.allSettled([
    ...MODULES.map(src=>import(src)),
    ...CLASSIC.map(src=>loadClassic(src)),
  ]);
  return startPromise;
}
function scheduleIdleLoad(){
  const run=()=>void loadMySecondaryFeatures();
  if('requestIdleCallback' in window){
    window.requestIdleCallback(run,{timeout:1500});
  }else{
    window.setTimeout(run,800);
  }
}
function scheduleAfterLoad(){
  if(document.readyState==='complete')scheduleIdleLoad();
  else window.addEventListener('load',scheduleIdleLoad,{once:true});
}
function shouldLoadNow(){
  return ['#account','#money','#personal-brand','#recommendations'].includes(location.hash);
}
window.addEventListener('hashchange',()=>{if(shouldLoadNow())void loadMySecondaryFeatures()});
document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('[data-finance-open],a[href="#account"],a[href="#money"],a[href="#personal-brand"],a[href="#recommendations"]')){
    void loadMySecondaryFeatures();
  }
},{capture:true,passive:true});
if(shouldLoadNow())void loadMySecondaryFeatures();
scheduleAfterLoad();
