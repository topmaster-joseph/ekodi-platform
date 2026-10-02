import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoreDiscoveryGraph, renderStoreFaqSection, STORE_DISCOVERY_PROFILES } from '../store-discovery.js';
import { publicDiscoveryRoute, renderLlmsTxt } from '../discovery-layer.js';

const fixtures=[
  ['jadam','자담치킨 목포대점','치킨'],
  ['pizzamaru','피자마루 목포대점','피자'],
  ['yogurt','요거트퍼플 목포대점','요거트 · 디저트'],
];

for(const [slug,name,category] of fixtures){
  test(`${slug} exposes local restaurant, menu, FAQ and breadcrumb entities`,()=>{
    const canonical=`https://ekodi.kr/${slug}`;
    const graph=buildStoreDiscoveryGraph({
      slug,name,canonical,description:`국립목포대학교 후문 ${name}`,
      brand:name.split(' ')[0],brandUrl:'https://example.com',category,
      address:'전남 무안군 청계면 승달산길 37-1',phone:'061-000-0000',hours:'11:00–22:00',
      map:'https://map.naver.com/p/search/test',image:'https://example.com/store.jpg',
      menuItems:[{name:'대표메뉴1'},{name:'대표메뉴2'}],
      orderUrl:'https://example.com/order',orderProviders:['배달의민족','요기요'],
    });
    const types=graph['@graph'].map((item)=>item['@type']);
    assert.equal(graph['@context'],'https://schema.org');
    assert.ok(types.includes('Restaurant'));
    assert.ok(types.includes('Menu'));
    assert.ok(types.includes('FAQPage'));
    assert.ok(types.includes('BreadcrumbList'));
    const restaurant=graph['@graph'].find((item)=>item['@type']==='Restaurant');
    assert.equal(restaurant.url,canonical);
    assert.ok(restaurant.alternateName.length>=3);
    assert.match(restaurant.keywords,/국립목포대학교 후문/);
    assert.equal(restaurant.potentialAction['@type'],'OrderAction');
    const menu=graph['@graph'].find((item)=>item['@type']==='Menu');
    assert.equal(menu.hasMenuItem.length,2);
    const faq=graph['@graph'].find((item)=>item['@type']==='FAQPage');
    assert.equal(faq.mainEntity.length,4);
    assert.match(renderStoreFaqSection({name,address:'전남 무안군',phone:'061',hours:'11:00–22:00',category}),/자주 묻는 질문/);
    assert.ok(STORE_DISCOVERY_PROFILES[slug].localTerms.includes('국립목포대학교 후문'));
  });

  test(`${slug} discovery route carries local search context`,()=>{
    const route=publicDiscoveryRoute(`/${slug}`);
    assert.ok(route);
    assert.equal(route.priority,'0.9');
    assert.equal(route.changefreq,'daily');
    assert.match(route.description,/국립목포대학교 후문/);
    const llms=renderLlmsTxt();
    assert.ok(llms.includes(route.label));
    assert.match(llms,/메뉴·가격·전화·영업시간·지도·배달주문/);
  });
}
