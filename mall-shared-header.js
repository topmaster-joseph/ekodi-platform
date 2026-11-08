// Shared Mall navigation for static Pages and weekly-picks edge rendering.
export function renderMallHeader({publicPrefix='',home=false,sellerHref}={}) {
 const prefix=String(publicPrefix || (home ? '' : '/ekodimall')).replace(/\/+$/,'');
 const root=prefix+'/';
 const href=hash=>home?hash:root+hash;
 const link=(hash,label,filter)=>'<a href="'+(home?hash:(filter?root+'?category='+encodeURIComponent(filter)+'#shop':root+hash))+'"'+(filter?' data-filter-target="'+filter+'"':'')+'>'+label+'</a>';
 return '<header class="header buyer-header mall-header"><div class="mall-header-inner">'+
 '<div class="mall-header-top">'+
 '<a class="brand" href="'+href('#top')+'" aria-label="에코디몰 홈"><span class="mark">E</span><span>EKODI<small>MALL</small></span></a>'+
 '<form id="mallGlobalSearch" class="mall-global-search" role="search" action="/ekodimall/" method="get"><label for="mallGlobalQuery" class="sr-only">상품검색</label><input id="mallGlobalQuery" name="q" type="search" maxlength="120" placeholder="무엇을 찾고 계세요?" autocomplete="off"><button type="submit" aria-label="상품 검색하기">⌕</button></form>'+
 '<div class="actions">'+
 '<span class="mall-account" data-mall-account aria-label="내 계정"><a class="mall-account-login" data-mall-login href="/auth/?site=mall">로그인</a>'+
 '<span class="mall-account-signed" data-mall-signed hidden><span class="mall-account-id" data-mall-id></span><button type="button" data-mall-logout>로그아웃</button></span></span>'+
 (home?'<button class="icon" id="wishBtn" aria-label="관심상품 보기">♡ <span id="wishCount">0</span></button>':'<a class="icon" href="'+root+'?wishlist=1" aria-label="관심상품 보기">♡ <span id="wishCount">0</span></a>')+
 '<a class="seller-mini" href="'+(sellerHref||root+'seller/')+'">판매하기</a>'+
 </div></div>'+
 '<nav class="mall-primary-nav" aria-label="쇼핑 카테고리">'+
 link('#shop','전체상품','all')+'<a href="'+prefix+'/picks">이번 주 추천</a>'+'<a href="'+prefix+'/coupang/">쿠팡제휴몰</a>'+'<a href="'+prefix+'/travel/stay/">여행·레저</a>'+
 link('#shop','로컬·특산물','local')+link('#shop','식품·건강','general')+
 link('#shop','생활·가전','living')+link('#shop','책·배움','book')+
 link('#shop','선물·기념품','gift')+
 '</nav></div></header><link rel="stylesheet" href="/ekodimall/assets/mall-account-header.css"><script defer src="/ekodimall/assets/mall-account-header.js"></script>'+(!home?'<script defer src="/ekodimall/assets/category-visibility.js"></script><script>(function(){var p=location.pathname,nav=document.querySelector(".mall-primary-nav");if(!nav)return;var a=Array.from(nav.querySelectorAll("a[href]")).find(function(link){return p.includes("/picks")?link.getAttribute("href").endsWith("/picks"):p.includes("/coupang/")?link.getAttribute("href").endsWith("/coupang/"):p.includes("/travel/")?link.getAttribute("href").endsWith("/travel/stay/"):false;});if(a)a.setAttribute("aria-current","page");})();</script>':'');
}
