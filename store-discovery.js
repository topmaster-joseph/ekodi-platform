const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const STORE_DISCOVERY_PROFILES=Object.freeze({
  jadam:Object.freeze({
    aliases:['자담치킨 목포대점','자담치킨 목포대후문','목포대 자담치킨','무안 자담치킨'],
    localTerms:['국립목포대학교 후문','목포대 후문','전남 무안군 청계면','목포대 맛집','목포대 배달'],
  }),
  pizzamaru:Object.freeze({
    aliases:['피자마루 목포대점','피자마루 목포대후문','목포대 피자마루','무안 피자마루'],
    localTerms:['국립목포대학교 후문','목포대 후문','전남 무안군 청계면','목포대 피자','목포대 배달'],
  }),
  yogurt:Object.freeze({
    aliases:['요거트퍼플 목포대점','요거트퍼플 무안목포대점','목포대 요거트퍼플','무안 요거트퍼플'],
    localTerms:['국립목포대학교 후문','목포대 후문','전남 무안군 청계면','목포대 디저트','목포대 배달'],
  }),
});

function clean(value){return String(value??'').trim();}
function uniq(values){return [...new Set((values||[]).map(clean).filter(Boolean))];}

export function storeDiscoveryFaq({name,address,phone,hours,category='메뉴',orderProviders=[]}={}){
  const storeName=clean(name)||'매장';
  const providerText=uniq(orderProviders).join(' · ');
  return [
    {
      question:`${storeName}은 어디에 있나요?`,
      answer:address?`${storeName}은 ${address}에 있습니다. 국립목포대학교 후문 인근에서 찾을 수 있으며, 정확한 이동 경로는 페이지의 길찾기 링크에서 확인할 수 있습니다.`:`${storeName}은 국립목포대학교 후문 인근 매장입니다. 정확한 주소와 길찾기는 매장 안내 영역에서 확인할 수 있습니다.`
    },
    {
      question:`${storeName} 주문은 어떻게 하나요?`,
      answer:providerText?`전화 주문과 ${providerText} 등 페이지에 연결된 배달 주문 경로를 이용할 수 있습니다. 실제 주문 가능 여부, 배달비와 쿠폰은 주문 직전 각 서비스에서 다시 확인해 주세요.`:phone?`전화(${phone})로 주문하거나 페이지에 표시되는 검증된 배달 주문 경로를 이용할 수 있습니다.`:'페이지에 표시되는 검증된 배달 주문 경로를 이용할 수 있습니다.'
    },
    {
      question:`${storeName} 영업시간은 언제인가요?`,
      answer:hours?`현재 안내 영업시간은 ${hours}입니다. 임시 휴무나 주문 마감은 달라질 수 있으므로 방문·주문 직전에 매장 또는 주문 앱에서 확인하는 것이 가장 정확합니다.`:'영업시간은 매장 또는 주문 앱의 최신 정보를 확인해 주세요.'
    },
    {
      question:`${storeName} ${category}와 가격은 어디서 확인하나요?`,
      answer:`이 페이지에서 대표 ${category}, 확인된 가격과 주문 경로를 한 번에 확인할 수 있습니다. 실시간 판매 여부, 옵션, 쿠폰, 배달비는 각 주문 채널의 최종 화면이 기준입니다.`
    },
  ];
}

export function renderStoreFaqSection(options={}){
  const faqs=storeDiscoveryFaq(options);
  return `<section id="faq" class="store-discovery-faq" aria-labelledby="store-discovery-faq-title"><div class="store-discovery-faq-head"><p>LOCAL · SEARCH · ANSWERS</p><h2 id="store-discovery-faq-title">자주 묻는 질문</h2></div><div class="store-discovery-faq-list">${faqs.map((item,index)=>`<details${index===0?' open':''}><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')}</div></section>`;
}

export function buildStoreDiscoveryGraph({
  slug,name,canonical,description,brand,brandUrl,category,address,phone,hours,map,image,
  menuItems=[],orderUrl='',orderProviders=[]
}={}){
  const profile=STORE_DISCOVERY_PROFILES[slug]||{aliases:[],localTerms:[]};
  const storeName=clean(name);
  const pageUrl=clean(canonical);
  const restaurantId=`${pageUrl}#restaurant`;
  const menuId=`${pageUrl}#menu`;
  const faqId=`${pageUrl}#faq`;
  const menu=uniq(menuItems.map((item)=>item?.name)).slice(0,30).map((itemName)=>({
    '@type':'MenuItem',
    name:itemName,
  }));
  const faqs=storeDiscoveryFaq({name:storeName,address,phone,hours,category,orderProviders});
  const restaurant={
    '@type':'Restaurant',
    '@id':restaurantId,
    name:storeName,
    alternateName:profile.aliases,
    url:pageUrl,
    description:clean(description),
    keywords:uniq([...profile.localTerms,brand,category,'메뉴','가격','배달','포장','전화주문']).join(', '),
    servesCuisine:category,
    areaServed:{'@type':'Place',name:'국립목포대학교 후문 · 전남 무안군 청계면'},
    brand:{'@type':'Brand',name:clean(brand),...(brandUrl?{url:brandUrl}:{})},
    menu:{'@id':menuId},
    mainEntityOfPage:{'@id':`${pageUrl}#webpage`},
    ...(phone?{telephone:phone}:{}),
    ...(address?{address:{'@type':'PostalAddress',streetAddress:address,addressRegion:'전라남도',addressCountry:'KR'}}:{}),
    ...(hours?{openingHours:hours}:{}),
    ...(map?{hasMap:map}:{}),
    ...(image?{image}:{}),
    ...(orderUrl?{potentialAction:{'@type':'OrderAction',target:orderUrl}}:{}),
  };
  return {
    '@context':'https://schema.org',
    '@graph':[
      {
        '@type':'WebPage',
        '@id':`${pageUrl}#webpage`,
        url:pageUrl,
        name:storeName,
        description:clean(description),
        inLanguage:'ko-KR',
        about:{'@id':restaurantId},
        mainEntity:{'@id':restaurantId},
        breadcrumb:{'@id':`${pageUrl}#breadcrumb`},
      },
      restaurant,
      {
        '@type':'Menu',
        '@id':menuId,
        name:`${storeName} 메뉴`,
        url:`${pageUrl}#menu`,
        ...(menu.length?{hasMenuItem:menu}:{}),
      },
      {
        '@type':'FAQPage',
        '@id':faqId,
        mainEntity:faqs.map((item)=>({
          '@type':'Question',
          name:item.question,
          acceptedAnswer:{'@type':'Answer',text:item.answer},
        })),
      },
      {
        '@type':'BreadcrumbList',
        '@id':`${pageUrl}#breadcrumb`,
        itemListElement:[
          {'@type':'ListItem',position:1,name:'EKODI',item:'https://ekodi.kr/'},
          {'@type':'ListItem',position:2,name:storeName,item:pageUrl},
        ],
      },
    ],
  };
}

export const STORE_DISCOVERY_CSS=`
.store-discovery-faq{margin-top:28px;padding:22px;border:1px solid var(--line,#ddd);border-radius:18px;background:#fff}
.store-discovery-faq-head p{margin:0 0 6px;color:var(--brand,#333);font-size:9px;font-weight:900;letter-spacing:.12em}
.store-discovery-faq-head h2{margin:0;font-size:22px;letter-spacing:-.04em}
.store-discovery-faq-list{display:grid;gap:8px;margin-top:14px}
.store-discovery-faq-list details{border:1px solid var(--line,#ddd);border-radius:11px;background:var(--soft,#fafafa);overflow:hidden}
.store-discovery-faq-list summary{cursor:pointer;padding:12px 14px;font-size:12px;font-weight:900;list-style:none}
.store-discovery-faq-list summary::-webkit-details-marker{display:none}
.store-discovery-faq-list p{margin:0;padding:0 14px 14px;color:var(--muted,#666);font-size:11px;line-height:1.65}
`;
