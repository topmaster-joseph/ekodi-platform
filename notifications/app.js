const base='/api/notifications', storageKey='ekodi-notification-device-token-v1';
const fields=document.querySelector('#topics'),message=document.querySelector('#status'),subscribe=document.querySelector('#subscribe'),unsubscribe=document.querySelector('#unsubscribe'),consent=document.querySelector('#consent'),inbox=document.querySelector('#inbox'),pushOption=document.querySelector('#pushOption');
const state={enabled:false,registered:false,channel:'inbox',version:'',vapid:''};
function say(v){message.textContent=v}
function token(){return localStorage.getItem(storageKey)||''}
function generateToken(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function selected(){return [...fields.querySelectorAll('input:checked')].map(x=>x.value)}
function buttons(){subscribe.disabled=!consent.checked||!selected().length;unsubscribe.disabled=!state.registered}
function publicKey(v){return Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function api(path,{method='GET',body,deviceToken}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(deviceToken)headers.authorization='Bearer '+deviceToken;
  const response=await fetch(base+path,{method,headers,credentials:'omit',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'invalid_response'}));
  if(!response.ok)throw Error(result.error||'request_failed');
  return result;
}
async function loadInbox(){
  inbox.replaceChildren();
  if(!state.registered)return;
  try{
    const {items}=await api('/inbox',{deviceToken:token()});
    if(!items.length){const li=document.createElement('li');li.textContent='아직 도착한 소식이 없습니다.';inbox.append(li)}
    for(const item of items){
      const li=document.createElement('li'),link=document.createElement('a'),body=document.createElement('p');
      link.textContent=item.title;link.href=item.target_path;body.textContent=item.body;li.append(link,body);inbox.append(li);
    }
  }catch{say('알림함을 확인할 수 없습니다.')}
}
async function start(){
  try{
    const config=await api('/config');
    state.enabled=config.enabled;state.version=config.consentVersion;state.vapid=config.vapidPublicKey;
    for(const [value,label] of Object.entries(config.topics||{})){
      const row=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
      row.className='topic';input.type='checkbox';input.value=value;name.textContent=label;
      row.append(input,name);fields.append(row);input.addEventListener('change',buttons);
    }
    fields.disabled=false;pushOption.disabled=!state.enabled;
    if(token()){
      try{
        const prefs=await api('/preferences',{deviceToken:token()});
        state.registered=true;state.channel=prefs.channel||'webPush';consent.checked=true;pushOption.checked=state.channel==='webPush'&&state.enabled;
        for(const item of fields.querySelectorAll('input'))item.checked=prefs.topics.includes(item.value);
      }catch{localStorage.removeItem(storageKey)}
    }
    say(state.enabled?'알림함을 구독하거나 브라우저 푸시까지 선택할 수 있습니다.':'사이트 알림함은 무료로 구독할 수 있습니다. 브라우저 푸시는 아직 준비 중입니다.');
    buttons();await loadInbox();
  }catch{say('알림 서버에 연결할 수 없습니다.')}
}
consent.addEventListener('change',buttons);
subscribe.addEventListener('click',async()=>{
  subscribe.disabled=true;
  try{
    const wantsPush=state.enabled&&pushOption.checked;
    let push=null;
    if(wantsPush){
      if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('이 브라우저는 웹푸시를 지원하지 않습니다.');
      const registration=await navigator.serviceWorker.register('/notifications/sw.js',{scope:'/notifications/'});
      if(Notification.permission==='denied')throw Error('브라우저 설정에서 알림 권한을 다시 허용해 주세요.');
      if(await Notification.requestPermission()!=='granted')throw Error('알림 권한이 허용되지 않았습니다.');
      push=await registration.pushManager.getSubscription();
      if(!push)push=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey(state.vapid)});
    }
    const deviceToken=token()||generateToken();
    const body={deviceToken,topics:selected(),consentVersion:state.version,marketingConsent:false};
    if(wantsPush)body.subscription=push.toJSON();else body.channel='inbox';
    const wasPush=state.channel==='webPush';
    await api('/subscription',{method:'POST',body});
    localStorage.setItem(storageKey,deviceToken);state.registered=true;state.channel=wantsPush?'webPush':'inbox';
    if(wasPush&&!wantsPush){
      const worker=await navigator.serviceWorker?.getRegistration?.('/notifications/');
      await worker?.pushManager?.getSubscription?.().then(s=>s?.unsubscribe()).catch(()=>false);
    }
    say(wantsPush?'웹푸시와 사이트 알림함을 구독했습니다.':'사이트 알림함 구독이 저장되었습니다. 브라우저 알림은 발송하지 않습니다.');await loadInbox();
  }catch(err){say(err.message||'구독에 실패했습니다.')}
  finally{buttons()}
});
unsubscribe.addEventListener('click',async()=>{
  unsubscribe.disabled=true;
  try{
    await api('/subscription',{method:'DELETE',deviceToken:token()});
    const worker=await navigator.serviceWorker.getRegistration('/notifications/');
    const push=await worker?.pushManager?.getSubscription();
    if(push)await push.unsubscribe().catch(()=>false);
    localStorage.removeItem(storageKey);state.registered=false;state.channel='inbox';consent.checked=false;pushOption.checked=false;
    say('구독을 해지하고 서버의 기기 구독 정보를 삭제했습니다.');inbox.replaceChildren();
  }catch{say('구독을 해지하지 못했습니다. 다시 시도해 주세요.')}
  finally{buttons()}
});
document.querySelector('#refresh').addEventListener('click',loadInbox);
start();