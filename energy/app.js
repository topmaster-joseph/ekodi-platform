const modes=[
  {label:'관찰형',help:'AI가 발전·소비·설비 상태를 관찰하고 이상을 설명합니다.'},
  {label:'제안형',help:'AI가 최적화안을 제안합니다. 설비를 직접 조작하지 않습니다.'},
  {label:'승인형',help:'사람이 승인한 예약·충전 같은 저위험 작업만 실행 대상으로 삼습니다.'},
  {label:'제한자동',help:'사전에 허용한 저위험 규칙만 자동화합니다. 안전장치·비상제어는 항상 제외됩니다.'}
];
const sample={solarNow:3.8,solarToday:14.2,homeNow:2.4,essSoc:68,essFlow:0.9,gridFlow:0.5,forecastToday:19.6,forecastSelf:72,saving:38400,health:96};
const $=(id)=>document.getElementById(id);
function money(value){return new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(value)}
function renderSample(){
  $('solarNow').textContent=sample.solarNow.toFixed(1);$('solarToday').textContent=sample.solarToday.toFixed(1);$('homeNow').textContent=sample.homeNow.toFixed(1);
  $('selfUse').textContent=Math.round(Math.min(100,sample.homeNow/sample.solarNow*100));$('essSoc').textContent=sample.essSoc;$('essFlow').textContent=`+${sample.essFlow.toFixed(1)}`;$('gridFlow').textContent=sample.gridFlow.toFixed(1);
  $('forecastToday').textContent=`${sample.forecastToday.toFixed(1)} kWh`;$('forecastSelf').textContent=`${sample.forecastSelf}%`;$('savingEstimate').textContent=money(sample.saving);$('healthScore').textContent=sample.health;
  $('updatedAt').textContent=`샘플 갱신 ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
}
function renderBars(){const values=[0,1,5,18,40,66,88,100,94,72,48,22,6,0];$('bars').innerHTML=values.map((v)=>`<div class="bar" style="height:${Math.max(2,v)}%" title="상대 발전량 ${v}%"></div>`).join('')}
function setMode(value){const index=Math.max(0,Math.min(3,Number(value)||0));localStorage.setItem('ekodi-energy-mode',String(index));$('modeRange').value=String(index);$('modeLabel').textContent=modes[index].label;$('modeHelp').textContent=modes[index].help;$('permissionSchedule').textContent=index>=2?'허용 범위 내':'승인 필요';$('permissionControl').textContent=index===3?'저위험만':'차단'}
function bindNavigation(){document.querySelectorAll('.nav-link').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach((b)=>b.classList.remove('active'));document.querySelectorAll('.view').forEach((v)=>v.classList.remove('active'));button.classList.add('active');$(`${button.dataset.view}View`).classList.add('active')}))}
async function refreshInsight(){const button=$('refreshInsight');button.disabled=true;button.textContent='판단 중…';try{const response=await fetch('/api/insight',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({telemetry:sample,controlMode:Number($('modeRange').value)})});if(!response.ok)throw new Error('insight_failed');const data=await response.json();$('nextActionTitle').textContent=data.insight.title;$('nextActionBody').textContent=data.insight.body}catch{$('nextActionTitle').textContent='현재는 안전한 제안 모드로 유지합니다.';$('nextActionBody').textContent='AI 판단 API에 연결하지 못했습니다. 설비 제어는 실행되지 않았습니다.'}finally{button.disabled=false;button.textContent='AI 다시 판단'}}
window.addEventListener('DOMContentLoaded',()=>{bindNavigation();renderSample();renderBars();setMode(localStorage.getItem('ekodi-energy-mode')??'1');$('modeRange').addEventListener('input',(event)=>setMode(event.target.value));$('refreshInsight').addEventListener('click',refreshInsight)});