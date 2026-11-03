import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTenantServiceMenuProjection} from '../tenant-service-admin-ui.js';

const snapshot=[
  {key:'channels',navSection:'publishing',categoryLabel:'채널·자동게시',label:'채널관리',readiness:'ready',menuVisible:true},
  {key:'autopost',navSection:'publishing',categoryLabel:'채널·자동게시',label:'자동게시',readiness:'ready',menuVisible:false},
  {key:'posthistory',navSection:'publishing',categoryLabel:'채널·자동게시',label:'게시이력',readiness:'ready',menuVisible:true},
  {key:'ai_content',navSection:'marketing',categoryLabel:'AI·콘텐츠',label:'AI 콘텐츠',readiness:'ready',menuVisible:false},
  {key:'marketing',navSection:'marketing',categoryLabel:'홍보·마케팅',label:'마케팅',readiness:'ready',menuVisible:false},
  {key:'planned',navSection:'publishing',categoryLabel:'예정',label:'예정 기능',readiness:'planned',menuVisible:true},
  {key:'none',navSection:null,categoryLabel:'서비스',label:'외부 연결',readiness:'ready',menuVisible:true}
];

test('multiple catalog services map to one menu: partial selection still means menu shown',()=>{
  const before=JSON.stringify(snapshot);
  const summary=summarizeTenantServiceMenuProjection(snapshot);
  assert.deepEqual(summary.map(x=>[x.navSection,x.state,x.selectedCount,x.total]),[
    ['publishing','partial',2,3],['marketing','hidden',0,2]
  ]);
  assert.deepEqual(summary[0].services,['채널관리','자동게시','게시이력']);
  assert.deepEqual(summary[1].labels,['AI·콘텐츠','홍보·마케팅']);
  assert.equal(JSON.stringify(snapshot),before,'must not mutate server snapshot');
});

test('section appears only when a ready linked service is selected',()=>{
  const selected=snapshot.map(item=>item.navSection==='publishing'?{...item,menuVisible:false}:item);
  assert.equal(summarizeTenantServiceMenuProjection(selected)[0].state,'hidden');
  const all=snapshot.map(item=>item.readiness==='ready'&&item.navSection?{...item,menuVisible:true}:item);
  assert.deepEqual(summarizeTenantServiceMenuProjection(all).map(x=>x.state),['visible','visible']);
});

test('unready and unmapped services are not represented as working sidebar links',()=>{
  assert.deepEqual(summarizeTenantServiceMenuProjection([]),[]);
  assert.deepEqual(summarizeTenantServiceMenuProjection(null),[]);
  assert.deepEqual(summarizeTenantServiceMenuProjection([
    {readiness:'planned',navSection:'future',menuVisible:true},
    {readiness:'ready',navSection:null,menuVisible:true},
  ]),[]);
});
