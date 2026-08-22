const KIND_PRIORITY=Object.freeze({personal:10,business:20,organization:30,church:40,community:50,project:60});
const locale=new Intl.Collator('ko',{numeric:true,sensitivity:'base'});
let scheduled=false;

function kindOf(card){
  const value=String(card?.querySelector('.workspace-body small')?.textContent||'personal').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(KIND_PRIORITY,value)?value:'project';
}
function nameOf(card){return String(card?.querySelector('.workspace-body h3')?.textContent||'').trim();}
function keyOf(card){return String(card?.dataset?.workspaceKey||'');}
function compareCards(a,b){
  const active=(b.classList.contains('selected')?1:0)-(a.classList.contains('selected')?1:0);
  if(active)return active;
  const kind=(KIND_PRIORITY[kindOf(a)]??999)-(KIND_PRIORITY[kindOf(b)]??999);
  if(kind)return kind;
  const name=locale.compare(nameOf(a),nameOf(b));
  return name||locale.compare(keyOf(a),keyOf(b));
}
function sameOrder(a,b){return a.length===b.length&&a.every((item,index)=>item===b[index]);}
function sortWorkspaceUi(){
  scheduled=false;
  const host=document.querySelector('#workspaceList');
  const select=document.querySelector('#workspaceSwitcher');
  if(!host||!select)return;
  const current=[...host.querySelectorAll('[data-workspace-key]')];
  if(!current.length)return;
  const sorted=[...current].sort(compareCards);
  if(!sameOrder(current,sorted))for(const card of sorted)host.append(card);
  const rank=new Map(sorted.map((card,index)=>[keyOf(card),index]));
  const options=[...select.options];
  const sortedOptions=[...options].sort((a,b)=>(rank.get(a.value)??9999)-(rank.get(b.value)??9999)||locale.compare(a.textContent||'',b.textContent||''));
  if(!sameOrder(options,sortedOptions))for(const option of sortedOptions)select.append(option);
  host.dataset.ekodiWorkspaceOrder='active-personal-business-organization-church-community-project';
  select.dataset.ekodiWorkspaceOrder=host.dataset.ekodiWorkspaceOrder;
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(sortWorkspaceUi);}

const observer=new MutationObserver(schedule);
const start=()=>{
  const host=document.querySelector('#workspaceList');
  const select=document.querySelector('#workspaceSwitcher');
  if(host)observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  if(select)observer.observe(select,{childList:true});
  schedule();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.addEventListener('ekodi:shell-theme',()=>document.documentElement.dataset.ekodiWorkspaceTheme='shell-v2');
