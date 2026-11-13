(()=>{
'use strict';
const workspace=String(document.body?.dataset.accountingWorkspace||'');
if(!workspace)return;
const get=id=>document.getElementById(id);
const year=get('accountingYear');
const status=get('accountingStatus');
const months=get('accountingMonths');
const retry=get('accountingRetry');
const panels={summary:get('accountingSummary'),monthly:get('accountingMonthly')};
const tabs=[...document.querySelectorAll('[data-accounting-tab]')];
if(!year||!status||!months||!retry||!panels.summary||!panels.monthly||tabs.length!==2)return;
const totals=Object.fromEntries(['income','expense','balance'].map(key=>[key,document.querySelector('[data-total="'+key+'"]')]));
if(Object.values(totals).some(node=>!node))return;
const validYear=value=>/^20\d{2}$/.test(String(value||''));
const integer=value=>typeof value==='number'&&Number.isSafeInteger(value);
const won=value=>Number(value).toLocaleString('ko-KR')+'원';
let serial=0,controller=null;
function message(value,error=false){status.textContent=value;status.dataset.error=error?'true':'false';}
function emptyMonth(value){
  const tr=document.createElement('tr');
  const td=document.createElement('td');
  td.colSpan=4;
  td.textContent=value;
  tr.append(td);
  months.replaceChildren(tr);
}
function clearAmounts(){
  for(const node of Object.values(totals))node.textContent='—';
  emptyMonth('공개 회계자료를 확인하고 있습니다.');
}
function render(data){
  if(!data||data.ok!==true||data.workspace!==workspace||!validYear(data.year))throw new Error('INVALID_PUBLIC_ACCOUNTING_RESPONSE');
  const total=data.total||{};
  if(!integer(total.count)||total.count<0||!integer(total.income)||!integer(total.expense)||!integer(total.balance)||total.income<0||total.expense<0||total.balance!==total.income-total.expense)throw new Error('INVALID_PUBLIC_ACCOUNTING_TOTAL');
  const available=[...new Set([data.year,...(Array.isArray(data.years)?data.years:[])].filter(validYear))].sort((a,b)=>b.localeCompare(a));
  year.replaceChildren(...available.map(value=>{
    const item=document.createElement('option');
    item.value=value;
    item.textContent=value+'년';
    item.selected=value===data.year;
    return item;
  }));
  if(total.count===0){
    clearAmounts();
    emptyMonth('해당 연도에 공개된 회계자료가 없습니다.');
    message(String(data.organization||'해당 조직')+' · '+data.year+'년 공개된 집계자료 없음');
    return;
  }
  if(!Array.isArray(data.months)||data.months.length!==12)throw new Error('INVALID_PUBLIC_ACCOUNTING_MONTHS');
  const rows=data.months.map((item,index)=>{
    const expected=data.year+'-'+String(index+1).padStart(2,'0');
    if(item?.month!==expected||!integer(item.count)||item.count<0||!integer(item.income)||!integer(item.expense)||!integer(item.balance)||item.income<0||item.expense<0||item.balance!==item.income-item.expense)throw new Error('INVALID_PUBLIC_ACCOUNTING_MONTH');
    const tr=document.createElement('tr');
    const cells=[(index+1)+'월',won(item.income),won(item.expense),won(item.balance)];
    cells.forEach((value,i)=>{
      const cell=document.createElement(i===0?'th':'td');
      if(i===0)cell.scope='row';
      cell.textContent=value;
      tr.append(cell);
    });
    return tr;
  });
  for(const key of ['income','expense','balance'])totals[key].textContent=won(total[key]);
  months.replaceChildren(...rows);
  message(String(data.organization||'해당 조직')+' · '+data.year+'년 공개 회계자료 · '+total.count.toLocaleString('ko-KR')+'건 집계');
}
async function load(selected=''){
  const request=++serial;
  if(controller)controller.abort();
  const current=new AbortController();
  controller=current;
  retry.hidden=true;
  clearAmounts();
  message('선택한 연도의 회계자료를 확인하고 있습니다.');
  try{
    const url=new URL('/api/finance/banking/public-summary',location.origin);
    url.searchParams.set('workspace',workspace);
    if(validYear(selected))url.searchParams.set('year',selected);
    const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',signal:current.signal});
    const data=await response.json();
    if(request!==serial)return;
    if(!response.ok||data?.ok!==true)throw new Error('PUBLIC_ACCOUNTING_UNAVAILABLE');
    if(validYear(selected)&&data.year!==selected)throw new Error('PUBLIC_ACCOUNTING_YEAR_MISMATCH');
    render(data);
  }catch(error){
    if(request!==serial||error?.name==='AbortError')return;
    clearAmounts();
    emptyMonth('조회된 회계자료가 없습니다.');
    message('공개 회계자료를 확인할 수 없습니다. 다시 조회해 주세요.',true);
    retry.hidden=false;
  }finally{
    if(request===serial)controller=null;
  }
}
function activateTab(target,focus=false){
  const key=target==='monthly'?'monthly':'summary';
  tabs.forEach((button,index)=>{
    const active=button.dataset.accountingTab===key;
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
    if(active&&focus)button.focus();
  });
  panels.summary.hidden=key!=='summary';
  panels.monthly.hidden=key!=='monthly';
}
tabs.forEach((button,index)=>{
  const key=button.dataset.accountingTab;
  const panel=panels[key];
  button.id='accountingTab-'+key;
  button.setAttribute('aria-controls',panel.id);
  panel.setAttribute('aria-labelledby',button.id);
  button.addEventListener('click',()=>activateTab(key));
  button.addEventListener('keydown',event=>{
    let next=-1;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
    if(event.key==='Home')next=0;
    if(event.key==='End')next=tabs.length-1;
    if(next>=0){event.preventDefault();activateTab(tabs[next].dataset.accountingTab,true);}
  });
});
year.addEventListener('change',()=>load(year.value));
retry.addEventListener('click',()=>load(year.value));
activateTab('summary');
load();
})();