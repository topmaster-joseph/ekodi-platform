// Shared Mall navigation for static Pages and weekly-picks edge rendering.
export function renderMallHeader({publicPrefix='',home=false,sellerHref}={}) {
 const prefix=String(publicPrefix).replace(/\/+$/,'');
 const root=prefix+'/';
 const href=hash=>home?hash:root+hash;
 const link=(hash,label,filter)=>'<a href="'+href(hash)+'"'+(home&&filter?' data-filter-target="'+filter+'"':'')+'>'+label+'</a>';
 return '<header class="header buyer-header mall-header"><div class="mall-header-inner">'+
 '<div class="mall-header-top">'+
 '<a class="brand" href="'+href('#top')+'" aria-label="에코디몰 홈"><span class="mark">E</span><span>EKODI<small>MALL</small></span></a>'+
 '<form id="mallGlobalSearch" class="mall-global-search" role="search" action="'+root+'" method="get"><label for="mallGlobalQuery" class="sr-only">에코디몰 상품 검색</label><input id="mallGlobalQuery" name="q" type="search" maxlength="120" placeholder="무엇을 찾고 계세요?" autocomplete="off"><button type="submit" aria-label="상품 검색하기">⌕</button></form>'+
 '<div class="actions">'+(home?'<button class="icon mall-search-mobile" id="searchBtn" aria-label="상품 검색">⌕</button>':'<a class="icon mall-search-mobile" href="'+href('#shop')+'" aria-label="상품 검색">⌕</a>')+
 (home?'<button class="icon" id="wishBtn" aria-label="관심상품 보기">♡ <span id="wishCount">0</span></button>':'<a class="icon" href="'+root+'?wishlist=1" aria-label="관심상품 보기">♡ <span id="wishCount">0</span></a>')+
 '<a class="seller-mini" href="'+(sellerHref||root+'seller/')+'">판매하기</a></div></div>'+
 '<nav class="mall-primary-nav" aria-label="쇼핑 카테고리">'+
 link('#shop','전체상품','all')+'<a href="'+prefix+'/travel/stay/">여행·레저</a>'+
 link('#shop','로컬·특산물','local')+link('#shop','식품·건강','general')+
 link('#shop','생활·가전','living')+link('#shop','책·배움','book')+
 link('#shop','선물·기념품','gift')+link('#recommend','AI 추천')+
 '<a href="'+prefix+'/picks">이번 주 추천</a></nav></div></header>';
}
