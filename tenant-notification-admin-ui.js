// Read-only notification counters in the existing tenant service settings.
// All authority is enforced in the central API. Never accept client counts,
// browser-supplied role claims or private device/subscription records.
export function mountTenantNotificationMetrics(root,{topic,load}={}){
  if(!root||!['church','mission'].includes(topic)||typeof load!=='function')return;
  const create=(tag,label,className='')=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(label!==undefined)node.textContent=label;
    return node;
  };
  const box=create('section',undefined,'tenant-notification-metrics');
  box.dataset.notificationTopic=topic;
  const heading=create('h3','알림 운영 현황');
  const explainer=create('p','이 사이트의 구독 기기와 발행 현황만 표시합니다. 구독자 개인 정보와 발송 권한은 제공하지 않습니다.');
  const status=create('p','현황 확인 중','tenant-notification-status');
  status.setAttribute('role','status');
  const refresh=create('button','새로고침');
  refresh.type='button';
  const rows=create('div',undefined,'tenant-notification-rows');
  async function reload(){
    refresh.disabled=true;
    status.textContent='운영 집계를 확인하고 있습니다.';
    rows.replaceChildren();
    try{
      const snapshot=await load(topic);
      if(!snapshot?.ok||!Array.isArray(snapshot.topics)
        ||snapshot.topics.some(item=>item.id!==topic))throw new Error('권한 또는 사이트 현황 불일치');
      if(!box.isConnected)return;
      for(const item of snapshot.topics){
        const line=create('div',undefined,'tenant-notification-row');
        line.append(
          create('strong',item.label),
          create('span','구독 기기 '+item.subscriberDevices+' · 이벤트 '+item.events+
            ' · 전달 처리 '+item.delivered+' · 대기 '+item.pending+' · 실패 '+item.failed)
        );
        rows.append(line);
      }
      status.textContent=snapshot.topics.length?'최신 집계 확인 완료':'표시할 집계가 없습니다.';
    }catch{
      if(box.isConnected)status.textContent='이 사이트의 알림 집계 조회 권한 또는 서버 연결을 확인할 수 없습니다.';
    }finally{refresh.disabled=false}
  }
  refresh.addEventListener('click',()=>void reload());
  box.append(heading,explainer,refresh,status,rows);
  root.append(box);
  if(!document.querySelector('[data-tenant-notification-style]')){
    const style=create('style');
    style.dataset.tenantNotificationStyle='1';
    style.textContent=`.tenant-notification-metrics{display:grid;gap:10px;border:1px solid #dbe4ef;border-radius:12px;background:#fff;padding:14px;margin-top:12px;min-width:0}.tenant-notification-metrics h3{margin:0;color:#1e293b;font-size:16px}.tenant-notification-metrics p{margin:0;color:#64748b;font-size:12px;line-height:1.55}.tenant-notification-metrics button{justify-self:start;min-height:42px;border:1px solid #d1dbea;background:#f8fbff;color:#16468d;padding:8px 14px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer}.tenant-notification-metrics button:disabled{opacity:.5}.tenant-notification-rows{display:grid;gap:7px}.tenant-notification-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e1e7ef;border-radius:9px;padding:11px;min-width:0;font-size:12px}.tenant-notification-row strong{font-size:13px}.tenant-notification-row span{color:#52647c;word-break:keep-all}@media(max-width:620px){.tenant-notification-row{flex-direction:column;align-items:flex-start}}`;
    document.head.append(style);
  }
  void reload();
}
