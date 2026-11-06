// TOSS-MALL-UNDERWRITING-001 / MALL-CHROME-WIDTH-001:
// Read-only sale category navigation: identical availability rules on the Mall home,
// weekly picks and affiliate pages. Never hide a category on incomplete evidence.
(()=>{
  'use strict';
  const grid=document.querySelector('#grid');
  const filters=document.querySelector('#filters');
  const categories=['general','living','book','gift'];
  const buttons=filters?[...filters.querySelectorAll('[data-filter]')]:[];
  const shortcuts=[...document.querySelectorAll('.mall-category-shortcuts [data-filter-target],.mall-primary-nav [data-filter-target]')];
  if(!grid&&!shortcuts.length)return;
  const cards=()=>grid?[...grid.querySelectorAll('[data-product][data-category]')]:[];
  const isLive=item=>item?.checkoutReady===true||
    (item?.product?.saleType==='affiliate'&&/^https:\/\//i.test(String(item?.product?.affiliateUrl||'')));
  const findButton=category=>buttons.find(b=>b.dataset.filter===category);
  const findShortcuts=category=>shortcuts.filter(a=>a.dataset.filterTarget===category);
  const localCard=()=>cards().some(card=>Boolean(String(card.dataset.regionIds||'').trim()));
  const hasCategory=category=>cards().some(card=>card.dataset.category===category);
  // Only advertise confirmed sale-ready categories in visible navigation.
  // Direct category URLs remain reachable and show a truthful empty state.
  // An API failure or incomplete inventory is never evidence that a category is empty.
  const setVisible=(category,available)=>{
    const filter=findButton(category);
    if(filter){
      filter.hidden=!available;
      filter.dataset.mallEmptyCategory=available?'false':'true';
    }
    for(const link of findShortcuts(category)){
      link.hidden=!available;
      link.dataset.mallEmptyCategory=available?'false':'true';
      link.title=available?'':'현재 판매 가능한 상품이 없어 카테고리 메뉴에서 숨겼습니다.';
    }
    // A direct /?category=... link must remain on that category's empty state;
    // silently jumping to All incorrectly suggests the selected category sells.
  };
  const revealLoaded=()=>{
    for(const category of categories)if(hasCategory(category))setVisible(category,true);
    if(localCard())setVisible('local',true);
  };
  const probe=async category=>{
    if(hasCategory(category))return true;
    try{
      const url='/ekodimall/api/api/public/products?limit=1&category='+encodeURIComponent(category);
      const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',
        headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
      if(!response.ok)return null;
      const data=await response.json();
      if(!Array.isArray(data.products))return null;
      if(data.products.some(isLive))return true;
      // A partial page with non-sale-ready drafts is not proof of emptiness.
      // Only an empty server response establishes that no public product exists.
      return data.products.length===0?false:null;
    }catch{return null;} // Read-only API failure is not proof of an empty category.
  };
  // On non-home views the static product cards are not in the DOM. Reuse the
  // build's real sale-ready category set rather than guessing from route names.
  const staticAvailability=async()=>{
    if(grid)return {categories:[],hasLocal:false,complete:true};
    try{
      const response=await fetch('/ekodimall/category-availability.json',{
        method:'GET',cache:'no-store',credentials:'omit',headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)
      });
      if(!response.ok)return null;
      const data=await response.json();
      if(!Array.isArray(data.categories)||typeof data.hasLocal!=='boolean')return null;
      return {categories:data.categories,hasLocal:data.hasLocal,complete:true};
    }catch{return null;}
  };
  (async()=>{
    const staticState=await staticAvailability();
    const availability=await Promise.all(categories.map(probe));
    availability.forEach((available,i)=>{
      const category=categories[i];
      if(available===true||hasCategory(category)||staticState?.categories.includes(category)){
        setVisible(category,true);
      }else if(available===false&&staticState?.complete){
        setVisible(category,false);
      }
    });
    const staticLocal=Boolean(staticState?.hasLocal);
    if(availability.every(value=>value===false)&&!localCard()&&!staticLocal&&staticState?.complete){
      setVisible('local',false);
    }
    revealLoaded();
  })();
  if(grid){
    new MutationObserver(revealLoaded).observe(grid,{childList:true,subtree:true});
    window.addEventListener('ekodi:marketplace-products-loaded',revealLoaded);
  }
})();
