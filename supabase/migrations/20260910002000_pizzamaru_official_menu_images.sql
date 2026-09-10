-- Keep PizzaMaru Mokpo Univ storefront product imagery aligned to HQ-provided assets.
with official_menu(name,image_url,source_url) as (values
  ('이탈리안 치즈 피자'::text,'https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102323.jpg'::text,'https://www.pizzamaru.co.kr/menu/11/'::text),
  ('페퍼로니 피자','https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154420.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('콤비네이션 피자','https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154437.jpg','https://www.pizzamaru.co.kr/product/15980188279162'),
  ('포테이토 피자','https://www.pizzamaru.co.kr/d_fileinfo/img/0120221229154408.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('꿀고구마 피자','https://www.pizzamaru.co.kr/d_fileinfo/img/0120250317102052.jpg','https://www.pizzamaru.co.kr/menu/11/'),
  ('불고기 피자','https://www.pizzamaru.co.kr/d_fileinfo/img/0120200821231040.jpg','https://www.pizzamaru.co.kr/menu/11/')
)
update public.store_menu_items m
set image_url=o.image_url,
    source_basis='brand_official',
    source_url=o.source_url,
    verified_at=now(),
    updated_at=now()
from official_menu o, public.stores s
where m.store_id=s.id
  and lower(s.operating_space_slug)='pizzamaru'
  and m.canonical_name=o.name;
