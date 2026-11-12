(()=>{'use strict';
const root=document.body,workspace=String(root?.dataset.accountingWorkspace||'');if(!workspace)return;
const year=document.querySelector('#accountingYear'),status=document.querySelector('#accountingStatus'),months=document.querySelector('#accountingMonths');
const won=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const setStatus=(text,error=false)=>{status.textContent=text;status.dataset.error=error?'true':'false'};
function render(data){year.innerHTML=(data.years||[data.year]).map(value=>`<option value="${value}"${value===data.year?' selected':''}>${value}년</option>`).join('');for(const key of ['income','expense','balance'])document.querySelector(`[data-total="${key}"]`).textContent=won(data.total?.[key]);months.innerHTML=(data.months||[]).map(row=>`<tr><th scope="row">${Number(String(row.month).slice(5))}월</th><td>${won(row.income)}</td><td>${won(row.expense)}</td><td>${won(row.balance)}</td></tr>`).join('');setStatus(`${data.organization} · ${data.year}년 공개 회계 총괄 · ${Number(data.total?.count||0).toLocaleString('ko-KR')}건 집계`)}
async function load(selected=''){setStatus('회계자료를 불러오고 있습니다.');try{const url=new URL('/api/finance/banking/public-summary',location.origin);url.searchParams.set('workspace',workspace);if(selected)url.searchParams.set('year',selected);const response=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'자료를 불러오지 못했습니다.');render(data)}catch(error){setStatus('공개할 회계자료를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.',true);months.innerHTML='<tr><td colspan="4">표시할 자료가 없습니다.</td></tr>'}}
year.addEventListener('change',()=>load(year.value));
document.querySelectorAll('[data-accounting-tab]').forEach(button=>button.addEventListener('click',()=>{const tab=button.dataset.accountingTab;document.querySelectorAll('[data-accounting-tab]').forEach(item=>item.setAttribute('aria-selected',String(item===button)));document.querySelector('#accountingSummary').hidden=tab!=='summary';document.querySelector('#accountingMonthly').hidden=tab!=='monthly'}));
load();
})();
