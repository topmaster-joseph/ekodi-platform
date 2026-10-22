// Real photographs for mood/transition slides. All from Unsplash under the Unsplash License (free to use,
// no permission needed; credit is given on the slide as a courtesy). Served from Unsplash's image CDN.
// Source pages were checked on 2026-10-22.
const U=(id,w=1920)=>'https://images.unsplash.com/photo-'+id+'?auto=format&fit=crop&w='+w+'&q=72';
export const PHOTOS=Object.freeze({
  mist:{src:U('1500534314209-a25ddb2bd429'),alt:'흰 안개가 걸린 산 능선',credit:'Ivana Cajina',page:'https://unsplash.com/photos/mountains-under-white-mist-at-daytime-HDd-NQ_AMNQ'},
  goldenSea:{src:U('1444044205806-38f3ed106c10'),alt:'황금빛 구름 아래 잔잔한 바다',credit:'Jonathan Bean',page:'https://unsplash.com/photos/calm-sea-under-golden-clouds-ywnnwzcdR5o'},
  river:{src:U('1421790500381-fc9b5996f343'),alt:'숲 사이로 흐르는 강',credit:'Matthew Smith',page:'https://unsplash.com/photos/river-surrounded-by-trees-rFBA42UFpLs'},
  forest:{src:U('1717964134799-a98f497172a5'),alt:'푸른 숲속을 흐르는 시냇물',credit:'Daniel Alexandre Páscoa',page:'https://unsplash.com/photos/a-stream-running-through-a-lush-green-forest-nM7KMy14kcY'},
  field:{src:U('1644623256334-081c58fa8b11'),alt:'구름 사이로 햇살이 비치는 초원',credit:'Michael Busch',page:'https://unsplash.com/photos/the-sun-is-shining-through-the-clouds-over-a-grassy-field-AyPK098HOmg'},
  dawnSea:{src:U('1474540412665-1cdae210ae6b'),alt:'푸른빛과 분홍빛이 어우러진 새벽 바다',credit:'Harli Marten',page:'https://unsplash.com/photos/photo-of-blue-and-pink-sea-n7a2OJDSZns'}
});
