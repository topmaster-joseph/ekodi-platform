// TOSS-MALL-UNDERWRITING-001: never advertise an empty sale category.
// Read-only public listing probes; no payments, mutation, seller identity, or secrets.
(()=>{
  'use strict';
  const grid=document.querySelector('#grid');
  const filters=document.querySelector('#filters');
  if(!grid||!filters)return;
  const categories=['general','living','book','gift'];
  const buttons=[...filters.querySelectorAll('[data-filter]')];
  const shortcuts=[...document.querySelectorAll('.mall-category-shortcuts [data-filter-target],.mall-primary-nav [data-filter-target]')];
  const cards=()=>[...grid.querySelectorAll('[data-product][data-category]')];
  const isLive=item=>item?.checkoutReady===true||
    (item?.product?.saleType==='affiliate'&&/^https:\/\//i.test(String(item?.product?.affiliateUrl||'')));
  const findButton=category=>buttons.find(b=>b.dataset.filter===category);
  const findShortcuts=category=>shortcuts.filter(a=>a.dataset.filterTarget===category);
  const localCard=()=>cards().some(card=>Boolean(String(card.dataset.regionIds||'').trim()));
  const hasCategory=category=>cards().some(card=>card.dataset.category===category);
  const setVisible=(category,available)=>{
    const nodes=[findButton(category),...findShortcuts(category)].filter(Boolean);
    for(const node of nodes){
      node.hidden=!available;
      node.dataset.mallEmptyCategory=available?'false':'true';
    }
    if(!available&&findButton(category)?.classList.contains('active')){
      const all=findButton('all');
      if(all&&!all.hidden)all.click();
    }
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
      if(!response.ok)return null; // Unknown is NOT proof of an empty category.
      const data=await response.json();
      if(!Array.isArray(data.products))return null;
      return data.products.some(isLive);
    }catch{return null;} // Do not hide categories on a transient API failure.
  };
  Promise.all(categories.map(probe)).then(availability=>{
    availability.forEach((available,i)=>{
      if(available!==null)setVisible(categories[i],available||hasCategory(categories[i]));
    });
    if(availability.every(value=>value===false)&&!localCard())setVisible('local',false);
    revealLoaded();
  });
  new MutationObserver(revealLoaded).observe(grid,{childList:true,subtree:true});
  window.addEventListener('ekodi:marketplace-products-loaded',revealLoaded);
})();
