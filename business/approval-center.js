(()=>{
  const SESSION_KEY='ekodi-business-session';
  const ACTION_LABELS={
    send_customer_message:'고객 메시지 발송',
    publish_campaign:'캠페인 공개',
    change_ad_budget:'광고 예산 변경',
    change_price:'가격 변경',
    issue_refund:'환불 처리',
    submit_job_posting:'채용공고 공개',
    share_customer_data:'고객정보 공유'
  };
  let trigger=null;
  let layer=null;
  let list=null;
  let status=null;
  let loading=false;

  function readSession(){
    try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}
  }
  function sessionExpiry(value){
    const explicit=Number(value?.expiresAt||0);
    return explicit>0?explicit:Math.floor(Date.now()/1000)+Number(value?.expiresIn||3600);
  }
  async function accessToken(){
    const current=readSession();
    if(!current?.accessToken)return'';
    const now=Math.floor(Date.now()/1000);
    if(Number(current.expiresAt||0)>now+60)return current.accessToken;
    if(!current.refreshToken)return'';
    try{
      const response=await fetch('/api/auth/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:current.refreshToken})});
      const data=await response.json();
      if(!response.ok||!data.accessToken||!data.refreshToken)return'';
      data.expiresAt=sessionExpiry(data);
      sessionStorage.setItem(SESSION_KEY,JSON.stringify(data));
      return data.accessToken;
    }catch{return''}
  }
  async function authedPost(path,body){
    const token=await accessToken();
    if(!token)throw Object.assign(new Error('authentication_required'),{status:401});
    const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body||{})});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});
    return data;
  }
  function workspaceKey(){
    const select=document.getElementById('workspaceSelect');
    if(select?.value)return select.value;
    const path=location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();
    return path||'ekodibiz';
  }
  function node(tag,className,text){
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!=null)el.textContent=String(text);
    return el;
  }
  function formatWhen(value){
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'요청 시각 미상':date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function actionLabel(value){return ACTION_LABELS[value]||String(value||'승인 필요 작업').replaceAll('_',' ')}
  function setCount(count){
    if(!trigger)return;
    const safe=Number.isFinite(Number(count))?Math.max(0,Number(count)):0;
    trigger.dataset.count=String(safe);
    trigger.querySelector('.approval-trigger-label').textContent=safe>0?'승인대기':'승인함';
    trigger.querySelector('.approval-count').textContent=String(safe);
    trigger.setAttribute('aria-label',safe>0?`AI 실행 승인센터, 승인대기 ${safe}건`:'AI 실행 승인센터');
    const actionMeta=document.getElementById('actionMeta');
    if(actionMeta&&readSession()?.accessToken)actionMeta.textContent=`승인 필요 ${safe}`;
  }
  function renderLogin(){
    list.replaceChildren();
    const box=node('div','approval-empty');
    box.append(node('strong','', '로그인 후 승인함을 확인할 수 있습니다.'));
    box.append(node('p','approval-empty-note','승인은 워크스페이스 권한과 함께 확인합니다.'));
    const auth=document.getElementById('authLink');
    if(auth?.href){const link=node('a','approval-login','로그인하기');link.href=auth.href;box.append(link)}
    list.append(box);setCount(0);
  }
  function decisionLabel(decision){
    if(decision==='approved')return'승인이 기록되었습니다.';
    if(decision==='revision_requested')return'수정 요청으로 돌려보냈습니다.';
    return'거절로 기록되었습니다.';
  }
  async function decide(actionId,decision,card){
    const buttons=[...card.querySelectorAll('button')];buttons.forEach(button=>button.disabled=true);
    status.textContent='결정을 안전하게 기록하고 있습니다.';
    try{
      await authedPost('/api/decide-action',{actionId,decision});
      status.textContent=`${decisionLabel(decision)} 외부 실행은 별도 실행 어댑터가 허용된 범위에서만 이어집니다.`;
      await loadApprovals();
    }catch(error){
      status.textContent=error.status===403?'이 워크스페이스의 승인 권한이 없습니다.':'결정을 기록하지 못했습니다. 외부 실행은 시작되지 않았습니다.';
      buttons.forEach(button=>button.disabled=false);
    }
  }
  function approvalCard(item){
    const card=node('article','approval-card');
    const top=node('div','approval-card-top');
    const titleWrap=node('div');titleWrap.append(node('small','',actionLabel(item.actionType)),node('h3','',item.title||'승인 필요 작업'));
    const priority=node('span',`approval-priority ${item.priority||'normal'}`,item.priority==='urgent'?'긴급':item.priority==='high'?'높음':item.priority==='low'?'낮음':'보통');
    top.append(titleWrap,priority);card.append(top);
    if(item.summary)card.append(node('p','',item.summary));
    const meta=node('div','approval-meta');meta.append(node('span','',formatWhen(item.requestedAt)),node('span','','사람의 결정 대기'));card.append(meta);
    const actions=node('div','approval-actions');
    const approve=node('button','approve','승인하기');approve.type='button';approve.addEventListener('click',()=>decide(item.id,'approved',card));
    const revise=node('button','revise','수정 요청');revise.type='button';revise.addEventListener('click',()=>decide(item.id,'revision_requested',card));
    const reject=node('button','reject','거절');reject.type='button';reject.addEventListener('click',()=>decide(item.id,'rejected',card));
    actions.append(approve,revise,reject);card.append(actions);
    return card;
  }
  function renderItems(payload){
    const items=Array.isArray(payload?.items)?payload.items:[];
    list.replaceChildren();setCount(payload?.count??items.length);
    if(!items.length){
      const empty=node('div','approval-empty');empty.append(node('strong','','현재 기다리는 승인이 없습니다.'),node('p','','AI는 승인 없이 실행하면 안 되는 작업에서 계속 멈춥니다.'));list.append(empty);return;
    }
    items.forEach(item=>list.append(approvalCard(item)));
  }
  async function loadApprovals(){
    if(loading)return;
    if(!readSession()?.accessToken){renderLogin();return}
    loading=true;status.textContent='승인대기 작업을 확인하고 있습니다.';
    try{
      const payload=await authedPost('/api/approvals',{workspace:workspaceKey()});
      renderItems(payload);status.textContent=payload.count>0?`중요 작업 ${payload.count}건이 사람의 결정을 기다립니다.`:'지금은 사람이 결정할 작업이 없습니다.';
    }catch(error){
      list.replaceChildren();
      const empty=node('div','approval-empty');
      empty.textContent=error.status===403?'이 워크스페이스에서 승인할 권한이 없습니다.':'승인함을 불러오지 못했습니다. 외부 실행은 계속 보류됩니다.';
      list.append(empty);setCount(0);status.textContent='승인함 연결을 확인해 주세요.';
    }finally{loading=false}
  }
  function close(){layer.hidden=true;trigger?.focus()}
  async function open(){layer.hidden=false;status.textContent='승인함을 여는 중입니다.';await loadApprovals()}
  function install(){
    if(document.getElementById('approvalCenterOpen'))return;
    const css=document.createElement('link');css.rel='stylesheet';css.href='/approval-center.css';document.head.append(css);
    const topActions=document.querySelector('.top-actions');
    if(!topActions)return;
    trigger=node('button','approval-trigger');trigger.type='button';trigger.id='approvalCenterOpen';trigger.dataset.count='0';
    const label=node('span','approval-trigger-label','승인함');const count=node('span','approval-count','0');trigger.append(label,count);
    const auth=document.getElementById('authLink');topActions.insertBefore(trigger,auth||topActions.firstChild);trigger.addEventListener('click',open);

    layer=node('div','approval-layer');layer.id='approvalCenterLayer';layer.hidden=true;
    const drawer=node('aside','approval-drawer');drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-labelledby','approvalCenterTitle');
    const head=node('div','approval-head');const copy=node('div');const title=node('h2','', 'AI 실행 승인센터');title.id='approvalCenterTitle';copy.append(title,node('p','', 'AI가 멈춰 있는 중요 행동을 확인하고 결정합니다.'));
    const closeButton=node('button','approval-close','×');closeButton.type='button';closeButton.setAttribute('aria-label','승인센터 닫기');closeButton.addEventListener('click',close);head.append(copy,closeButton);
    status=node('div','approval-status','승인함을 준비하고 있습니다.');status.setAttribute('aria-live','polite');
    list=node('div','approval-list');
    const foot=node('p','approval-footnote','승인센터 v1은 사람의 결정을 기록하는 안전문입니다. 현재 외부 결제·발송·계약 실행은 승인과 별개의 공식 실행 어댑터가 연결되기 전에는 시작하지 않습니다.');
    drawer.append(head,status,list,foot);layer.append(drawer);document.body.append(layer);
    layer.addEventListener('click',event=>{if(event.target===layer)close()});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!layer.hidden)close()});
    document.getElementById('workspaceSelect')?.addEventListener('change',()=>setTimeout(loadApprovals,0));
    const authLink=document.getElementById('authLink');
    if(authLink)new MutationObserver(()=>setTimeout(loadApprovals,0)).observe(authLink,{attributes:true,childList:true,subtree:true});
    setTimeout(loadApprovals,0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();