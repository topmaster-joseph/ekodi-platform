export const STORE_INDEXNOW_KEY='e4c0d1a7b29f43d8a65c712fe9b3048c';
export const STORE_INDEXNOW_KEY_PATH=`/${STORE_INDEXNOW_KEY}.txt`;
export const STORE_INDEXNOW_KEY_URL=`https://ekodi.kr${STORE_INDEXNOW_KEY_PATH}`;
export const STORE_DISCOVERY_URLS=Object.freeze([
  'https://ekodi.kr/cmpmyi',
  'https://ekodi.kr/jadam',
  'https://ekodi.kr/pizzamaru',
  'https://ekodi.kr/yogurt',
]);

export function isStoreIndexNowKeyPath(pathname){
  return String(pathname||'')===STORE_INDEXNOW_KEY_PATH;
}

export function storeIndexNowKeyResponse(){
  return new Response(STORE_INDEXNOW_KEY,{
    status:200,
    headers:{
      'content-type':'text/plain; charset=utf-8',
      'cache-control':'public, max-age=86400, immutable',
      'x-content-type-options':'nosniff',
      'x-robots-tag':'noindex, nofollow, noarchive',
      'x-ekodi-route':'store-indexnow-key',
    },
  });
}
