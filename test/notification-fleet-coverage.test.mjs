import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildNotificationFleetCoverage} from '../notification-fleet-coverage.js';
import {NOTIFICATION_TOPIC_PATHS} from '../notification-control.js';

const site=(id,name,canonicalUrl,extra={})=>({id,name,canonicalUrl,...extra});
const service=(id,name,url,status='live')=>({id,name,url,status});

test('fleet audit merges duplicate paths without inventing topic coverage',()=>{
  const r=buildNotificationFleetCoverage({
    workspaceSites:[
      site('a','교회','https://ekodi.kr/ekodichurch'),
      site('b','사업','https://ekodi.kr/ekodibiz'),
      site('old','퇴역','https://ekodi.kr/jadam',{lifecycleState:'retired'}),
      site('offsite','외부','https://example.com/unsafe')
    ],
    services:[
      service('church','교회 서비스','https://ekodi.kr/ekodichurch'),
      service('mall','에코디몰','https://ekodi.kr/ekodimall'),
      service('shop','계획','https://ekodi.kr/shop','planned'),
      service('nested','사업 내 하위서비스','https://ekodi.kr/ekodibiz/ai-agency')
    ],
    readiness:topic=>({ready:topic==='church',enabled:topic==='church',credentialsConfigured:topic==='church'})
  });
  assert.equal(r.scope,'registered_sites_only');
  assert.equal(r.liveDeliveryVerified,false);
  assert.equal(r.dynamicCustomerWorkspacesIncluded,false);
  assert.equal(r.counts.registered,4);
  assert.equal(r.counts.topicConnected,2);
  assert.equal(r.counts.notConnected,2);
  assert.equal(r.counts.publisherReady,1);
  assert.equal(r.counts.publisherNotReady,1);
  assert.equal(r.counts.retiredExcluded,1);
  assert.equal(r.counts.plannedExcluded,1);
  assert.equal(r.counts.unresolvableAddress,1);
  const church=r.sites.find(x=>x.id==='a');
  assert.deepEqual(church.sources,['workspace','service']);
  assert.equal(church.state,'publisher_ready');
  assert.equal(r.sites.find(x=>x.id==='b').state,'not_connected');
  assert.equal(r.sites.find(x=>x.id==='mall').state,'publisher_not_ready');
  assert.equal(r.sites.find(x=>x.id==='nested').topic,null);
  assert.equal(JSON.stringify(r).includes('example.com'),false);
});

test('topic ownership uses exact canonical path boundaries, never mere prefixes',()=>{
  const r=buildNotificationFleetCoverage({
    workspaceSites:[
      site('1','one','https://ekodi.kr/edu'),
      site('2','two','https://ekodi.kr/education'),
      site('3','three','https://ekodi.kr/edu/course-1'),
      site('4','four','https://ekodi.kr/ekodimall-external'),
      site('5','five','https://ekodi.kr/ekodimall/orders'),
      site('6','six','https://ekodi.kr/edu?token=never')
    ],
    services:[],
    readiness:()=>({ready:true})
  });
  assert.equal(r.sites.find(x=>x.id==='1').topic,'education');
  assert.equal(r.sites.find(x=>x.id==='2').topic,null);
  assert.equal(r.sites.find(x=>x.id==='3').topic,'education');
  assert.equal(r.sites.find(x=>x.id==='4').topic,null);
  assert.equal(r.sites.find(x=>x.id==='5').topic,'mall');
  assert.equal(r.sites.some(x=>x.id==='6'),false);
  assert.equal(r.counts.unresolvableAddress,1);
  assert.equal(NOTIFICATION_TOPIC_PATHS.education,'/edu');
});

test('real EKODI registry is audited without granting new publishing or payment power',()=>{
  const r=buildNotificationFleetCoverage();
  assert.ok(r.counts.registered>=10);
  assert.ok(r.sites.some(x=>x.path==='/ekodibiz'&&x.state==='not_connected'));
  assert.ok(r.sites.some(x=>x.path==='/ekodichurch'&&x.topic==='church'));
  assert.ok(r.sites.some(x=>x.path==='/ekodimall'&&x.topic==='mall'));
  assert.equal(r.liveDeliveryVerified,false);
  const source=readFileSync(new URL('../notification-fleet-coverage.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.run\(|\bfetch\(|AGENCY_LIVE_ENABLED\s*=\s*true/);
});
