// EKODI-NOTIFICATION-FLEET-001: registry-derived, read-only notification coverage.
// Registry inclusion is NOT proof of deployed event publication or phone receipt.
// Unlisted dynamic customer workspaces require separate authenticated enrollment.
import workspaces from './config/site-lifecycle-registry.json' with {type:'json'};
import ecosystem from './config/ecosystem-services.json' with {type:'json'};
import {NOTIFICATION_TOPICS, NOTIFICATION_TOPIC_PATHS, topicPublisherReadiness} from './notification-control.js';

const ROOT='https://ekodi.kr';
function canonicalPath(value){
  try {
    const url=new URL(String(value||''));
    if(url.origin!==ROOT||url.search||url.hash)return null;
    return url.pathname.replace(/\/+$/,'')||'/';
  } catch {return null;}
}
function inBoundary(path,root){
  return path===root||path.startsWith(root+'/');
}
function safeLabel(value){
  return String(value||'').replace(/[\r\n\x00-\x1f]/g,' ').trim().slice(0,90);
}
export function buildNotificationFleetCoverage({
  workspaceSites=workspaces.existingWorkspaceSites,
  services=ecosystem.services,
  topicPaths=NOTIFICATION_TOPIC_PATHS,
  topics=NOTIFICATION_TOPICS,
  readiness=topic=>topicPublisherReadiness({},topic)
}={}){
  const roots=Object.entries(topicPaths).sort((a,b)=>b[1].length-a[1].length);
  const entries=new Map();
  let retired=0, planned=0, unknownAddress=0;
  function add(source,item){
    if(!item||item.lifecycleState==='retired'||item.visibility==='archive-only'){
      retired++;return;
    }
    const state=String(item.status||item.lifecycleState||'active');
    if(state==='planned'){planned++;return;}
    const path=canonicalPath(item.canonicalUrl||item.url);
    if(!path){unknownAddress++;return;}
    let entry=entries.get(path);
    if(!entry){
      const match=roots.find(([,root])=>inBoundary(path,root));
      const topic=match?.[0]||null;
      entry={id:safeLabel(item.id)||path, name:safeLabel(item.name)||path,
        path, topic, topicLabel:topic?topics[topic]||topic:null,
        sources:[source], registryStatus:state};
      entries.set(path,entry);
    } else {
      if(!entry.sources.includes(source))entry.sources.push(source);
      if(source==='workspace')entry.name=safeLabel(item.name)||entry.name;
    }
  }
  for(const site of Array.isArray(workspaceSites)?workspaceSites:[])add('workspace',site);
  for(const service of Array.isArray(services)?services:[])add('service',service);
  const sites=[...entries.values()].map(entry=>{
    const pub=entry.topic?readiness(entry.topic):null;
    const state=!entry.topic?'not_connected':pub?.ready?'publisher_ready':'publisher_not_ready';
    const action=state==='not_connected'?'알림 주제·정본 경로를 등록하고 소유 서비스에 연결'
      :state==='publisher_not_ready'?'서비스 전용 발행 권한과 인증키를 확인'
      :'발행·전달·실기기 수신을 별도 검증';
    return {...entry,state,action};
  }).sort((a,b)=>a.name.localeCompare(b.name,'ko-KR'));
  const connected=sites.filter(site=>site.topic).length;
  return {
    registrySources:['config/site-lifecycle-registry.json','config/ecosystem-services.json'],
    scope:'registered_sites_only',liveDeliveryVerified:false,
    dynamicCustomerWorkspacesIncluded:false,
    counts:{registered:sites.length,topicConnected:connected,notConnected:sites.length-connected,
      publisherReady:sites.filter(site=>site.state==='publisher_ready').length,
      publisherNotReady:sites.filter(site=>site.state==='publisher_not_ready').length,
      plannedExcluded:planned,retiredExcluded:retired,unresolvableAddress:unknownAddress},
    sites
  };
}
