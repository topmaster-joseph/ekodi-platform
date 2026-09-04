const KIND_PRIORITY=Object.freeze({personal:10,business:20,organization:30,church:40,community:50,project:60});
const locale=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
let scheduled=false;

function kindOf(card){
  const value=String(card?.querySelector('.workspace-body small')?.textContent||'personal').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(KIND_PRIORITY,value)?value:'project';
}
function nameOf(card){return String(card?.querySelector('.workspace-body h3')?.textContent||'').trim();}
function keyOf(card){return String(card?.dataset?.workspaceKey||'');}
function roleOf(card){
  const values=[...card?.querySelectorAll('.meta span')||[]].map(node=>String(node.textContent||'').trim()).filter(Boolean);
  return values[1]||'';
}
function personName(){
  const value=String(document.querySelector('#identityName')?.textContent||'').trim();
  return value&&value!=='로그인 전'?value:'';
}
function compareCards(a,b){
  const active=(b.classList.contains('selected')?1:0)-(a.classList.contains('selected')?1:0);
  if(active)return active;
  const kind=(KIND_PRIORITY[kindOf(a)]??999)-(KIND_PRIORITY[kindOf(b)]??999);
  if(kind)return kind;
  const name=locale.compare(nameOf(a),nameOf(b));
  return name||locale.compare(keyOf(a),keyOf(b));
}
function sameOrder(a,b){return a.length===b.length&&a.every((item,index)=>item===b[index]);}
function syncShellContext(cards){
  const active=cards.find(card=>card.classList.contains('selected'));
  if(!active)return;
  const detail={workspaceKey:keyOf(active),workspaceName:nameOf(active),role:roleOf(active),personName:personName()};
  if(window.EKODIShell?.setContext)window.EKODIShell.setContext(detail);
  else window.dispatchEvent(new CustomEvent('ekodi:context-change',{detail}));
  document.documentElement.dataset.ekodiWorkspaceContext='shell-v2-synced';
}
function sortWorkspaceUi(){
  scheduled=false;
  const host=document.querySelector('#workspaceList');
  const select=document.querySelector('#workspaceSwitcher');
  if(!host)return;
  const current=[...host.querySelectorAll('[data-workspace-key]')];
  if(!current.length)return;
  const sorted=[...current].sort(compareCards);
  if(!sameOrder(current,sorted))for(const card of sorted)host.append(card);
  host.dataset.ekodiWorkspaceOrder='active-personal-business-organization-church-community-project';
  if(select){
    const rank=new Map(sorted.map((card,index)=>[keyOf(card),index]));
    const options=[...select.options];
    const sortedOptions=[...options].sort((a,b)=>(rank.get(a.value)??9999)-(rank.get(b.value)??9999)||locale.compare(a.textContent||'',b.textContent||''));
    if(!sameOrder(options,sortedOptions))for(const option of sortedOptions)select.append(option);
    select.dataset.ekodiWorkspaceOrder=host.dataset.ekodiWorkspaceOrder;
  }
  syncShellContext(sorted);
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(sortWorkspaceUi);}

const observer=new MutationObserver(schedule);
const start=()=>{
  const host=document.querySelector('#workspaceList');
  const select=document.querySelector('#workspaceSwitcher');
  const identity=document.querySelector('#identityName');
  if(host)observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(select)observer.observe(select,{childList:true});
  if(identity)observer.observe(identity,{childList:true,subtree:true,characterData:true});
  schedule();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('ekodi:shell-theme',()=>{document.documentElement.dataset.ekodiWorkspaceTheme='shell-v2';schedule();});
