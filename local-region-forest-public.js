import { serializeBrowserClient } from './browser-client-serializer.js';

function clientMain(){
  const root=document.querySelector('[data-forest-project-root]');
  if(!root)return;
  const history=root.querySelector('[data-forest-history]');
  const phase=root.querySelector('[data-forest-phase]');
  const status=root.querySelector('[data-forest-status]');
  const latest=root.querySelector('[data-forest-latest]');
  const latestDate=root.querySelector('[data-forest-latest-date]');
  const next=root.querySelector('[data-forest-next]');
  const categoryLabels={administration:'행정협의',research:'자료조사',field:'현장활동',participation:'주민참여',campus:'목포대',forest:'산림활동',commerce:'상권연계',media:'언론·홍보'};
  const statusLabels={completed:'완료',in_progress:'진행중',planned:'예정',waiting:'회신·대기'};
  const date=value=>{if(!value)return'';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'})};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node};
  function safeHref(value){try{const url=new URL(String(value||''),location.origin);return ['http:','https:'].includes(url.protocol)?url.href:''}catch{return''}}
  function render(data){
    const project=data.project||{};
    const records=Array.isArray(data.records)?data.records:[];
    phase.textContent=project.phase||'준비 중';
    status.textContent=project.statusText||'추진현황을 정리하고 있습니다.';
    latest.textContent=records[0]?.title||'등록된 활동이 없습니다.';
    latestDate.textContent=date(records[0]?.occurredOn||'');
    const nextRecord=records.find(item=>item.nextAction);
    next.textContent=project.nextStep||nextRecord?.nextAction||'다음 단계를 협의 중입니다.';
    history.replaceChildren();
    for(const record of records){
      const item=el('article','timeline-item');
      item.append(el('div','timeline-date',date(record.occurredOn)));
      const body=el('div','timeline-content');
      body.append(el('h3','',record.title));
      const meta=el('div','timeline-meta');
      meta.append(el('span','chip',categoryLabels[record.category]||record.category||'기록'),el('span','chip status',statusLabels[record.status]||record.status||''));
      if(record.place)meta.append(el('span','chip',record.place));
      body.append(meta);
      if(record.summary)body.append(el('p','',record.summary));
      if(Array.isArray(record.organizations)&&record.organizations.length)body.append(el('p','',record.organizations.join(' · ')));
      if(Array.isArray(record.evidence)&&record.evidence.length){
        const evidence=el('div','evidence');
        for(const source of record.evidence){
          const href=safeHref(source?.url);
          const node=href?document.createElement('a'):document.createElement('span');
          node.textContent=source?.label||source?.type||'근거자료';
          if(href){node.href=href;node.target='_blank';node.rel='noopener noreferrer'}
          evidence.append(node);
        }
        body.append(evidence);
      }
      if(record.nextAction)body.append(el('div','timeline-next','다음 조치 · '+record.nextAction));
      item.append(body);history.append(item);
    }
    if(!history.children.length)history.append(el('div','loading','공개된 추진이력이 없습니다.'));
  }
  fetch('/api/local-operations/cheonggye/projects/forest',{cache:'no-store'})
    .then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'이력을 불러오지 못했습니다.');return data})
    .then(render)
    .catch(error=>{history.replaceChildren(el('div','loading',error.message))});
}
export function localRegionForestPublicScript(){
  return new Response(serializeBrowserClient(clientMain),{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
