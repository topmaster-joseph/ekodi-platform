const NTS_BUSINESS_MARKER = 'loadAll();\n})();';

const NTS_BUSINESS_CODE = String.raw`
let ntsBusinessMap=new Map(),ntsBusinessBusy=false,ntsBusinessLoadedAt=0,ntsBusinessConfigured=null;
const ntsBaseRenderCustomers=renderCustomers,ntsBaseRenderSuppliers=renderSuppliers,ntsBaseLoadAll=loadAll;
const ntsOne=s=>document.querySelector(s),ntsAll=s=>[...document.querySelectorAll(s)];
const ntsDigits=v=>String(v??'').replace(/\D/g,'').slice(0,10);
function ntsBusinessNumbers(){return [...new Set([...profiles,...customers].map(x=>ntsDigits(x?.corpNum)).filter(x=>/^\d{10}$/.test(x)))]}
function ntsBusinessLabel(item){
 if(!item||!item.available)return ntsBusinessConfigured===false?'국세청 연동 대기':'국세청 확인 대기';
 const status=item.businessStatus||'상태 확인';const tax=item.taxType||'';
 return status+(tax?' · '+tax:'');
}
function ntsBusinessBadge(item){
 const label=esc(ntsBusinessLabel(item));
 if(!item||!item.available)return '<span class="status">'+label+'</span>';
 const cls=item.active?'status NTS_CONFIRMED':'status FAILED';
 return '<span class="'+cls+'">'+label+'</span>'+(item.stale?'<small> · 마지막 확인 '+esc(date(item.checkedAt))+'</small>':'');
}
function ntsAnnotate(rootSelector,rows){
 const cards=ntsAll(rootSelector+' article');
 rows.forEach((row,index)=>{
  const card=cards[index];if(!card)return;
  const no=ntsDigits(row?.corpNum),item=ntsBusinessMap.get(no);
  let host=card.querySelector('[data-nts-business]');
  if(!host){host=document.createElement('div');host.dataset.ntsBusiness='1';host.className='row-actions';card.append(host)}
  host.innerHTML=ntsBusinessBadge(item);
 });
}
renderCustomers=function(){ntsBaseRenderCustomers();ntsAnnotate('#customerList',customers)};
renderSuppliers=function(){ntsBaseRenderSuppliers();ntsAnnotate('#supplierList',profiles)};
function ntsSummary(textValue,bad=false){const el=ntsOne('#ntsBusinessSummary');if(!el)return;el.textContent=textValue;el.style.color=bad?'#fda4af':''}
async function ntsLoadBusinessStatuses(refresh=false){
 if(ntsBusinessBusy)return;
 const corpNums=ntsBusinessNumbers();
 if(!corpNums.length){ntsSummary('거래처가 등록되면 국세청 사업자 상태를 자동 확인합니다.');return}
 ntsBusinessBusy=true;const btn=ntsOne('#ntsBusinessRefresh');if(btn){btn.disabled=true;btn.textContent='국세청 확인 중…'}
 try{
  const result=await api('/api/finance/tax-business-status',{method:'POST',body:{organizationId:ORG,corpNums,refresh}});
  ntsBusinessConfigured=result.configured;ntsBusinessLoadedAt=Date.now();
  for(const item of result.items||[])ntsBusinessMap.set(ntsDigits(item.corpNum),item);
  renderCustomers();renderSuppliers();
  if(result.configured){
   const live=Number(result.liveCount||0),cache=Number(result.items?.length||0)-live;
   ntsSummary('국세청 사업자 상태 연결 · 실시간 갱신 '+live+'건 · 캐시 '+Math.max(0,cache)+'건 · 원천정보 약 30분 주기 갱신');
  }else{
   ntsSummary('국세청 공공데이터 연결 준비 완료 · 서비스키가 등록되면 자동 실시간 확인됩니다. 기존 세금 업무는 그대로 사용할 수 있습니다.');
  }
 }catch(error){
  ntsSummary('국세청 상태조회 일시 실패 · 마지막 정상조회 자료가 있으면 계속 표시합니다.',true);
 }finally{ntsBusinessBusy=false;if(btn){btn.disabled=false;btn.textContent='국세청 상태 확인'}}
}
loadAll=async function(){
 await ntsBaseLoadAll();
 const numbers=ntsBusinessNumbers(),missing=numbers.some(no=>!ntsBusinessMap.has(no));
 if(missing||Date.now()-ntsBusinessLoadedAt>30*60*1000)void ntsLoadBusinessStatuses(false);
};
function ntsSetupPanel(){
 const panel=document.querySelector('[data-view="customers"]');if(!panel||ntsOne('#ntsBusinessRefresh'))return;
 const head=panel.querySelector('.panel-head');const refresh=head?.querySelector('[data-action="refresh"]');
 const button=document.createElement('button');button.type='button';button.className='btn primary';button.id='ntsBusinessRefresh';button.textContent='국세청 상태 확인';button.onclick=()=>void ntsLoadBusinessStatuses(true);
 if(refresh){const actions=document.createElement('div');actions.className='row-actions';refresh.replaceWith(actions);actions.append(button,refresh)}else head?.append(button);
 const summary=document.createElement('p');summary.className='muted';summary.id='ntsBusinessSummary';summary.textContent='사업자번호를 국세청 공공데이터와 대조합니다. 휴·폐업 및 과세유형을 확인합니다.';
 panel.querySelector('.panel-head')?.insertAdjacentElement('afterend',summary);
}
async function ntsProbeInput(input){
 const no=ntsDigits(input.value),hint=input.parentElement?.querySelector('[data-nts-probe]');
 if(!hint)return;
 if(!/^\d{10}$/.test(no)){hint.textContent='사업자번호 10자리를 입력하면 국세청 상태를 확인합니다.';return}
 hint.textContent='국세청 확인 중…';
 try{
  const result=await api('/api/finance/tax-business-status?organizationId='+encodeURIComponent(ORG)+'&corpNum='+encodeURIComponent(no)+'&refresh=1');
  ntsBusinessConfigured=result.configured;const item=result.items?.[0];if(item)ntsBusinessMap.set(no,item);
  hint.textContent=ntsBusinessLabel(item)+(item?.checkedAt?' · '+date(item.checkedAt):'');
  hint.style.color=item?.available?(item.active?'#a7f3d0':'#fecdd3'):'';
 }catch(error){hint.textContent='국세청 확인 실패 · 저장은 계속할 수 있습니다.';hint.style.color='#fecdd3'}
}
function ntsAttachProbe(input){
 if(!input||input.dataset.ntsBound)return;input.dataset.ntsBound='1';
 const hint=document.createElement('small');hint.dataset.ntsProbe='1';hint.className='muted';hint.textContent='사업자번호 10자리를 입력하면 국세청 상태를 확인합니다.';input.parentElement?.append(hint);
 input.addEventListener('blur',()=>void ntsProbeInput(input));
}
function ntsScanForms(){
 for(const input of ntsAll('#modal input[name="corpNum"]'))ntsAttachProbe(input);
}
const ntsObserver=new MutationObserver(()=>ntsScanForms());ntsObserver.observe(document.body,{childList:true,subtree:true});
ntsSetupPanel();ntsScanForms();
`;

export async function injectTaxBusinessRegistry(response) {
  if (!response) return response;
  const source = await response.text();
  if (!source.includes(NTS_BUSINESS_MARKER) || source.includes('ntsBusinessRefresh')) {
    return new Response(source,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  const patched = source.replace(NTS_BUSINESS_MARKER, NTS_BUSINESS_CODE + '\n' + NTS_BUSINESS_MARKER);
  const headers = new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-ekodi-tax-business-registry','v1');
  return new Response(patched,{status:response.status,statusText:response.statusText,headers});
}
