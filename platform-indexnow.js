export const EKODI_INDEXNOW_KEY='e4c0d1a7b29f43d8a65c712fe9b3048c';
export const EKODI_INDEXNOW_KEY_PATH=`/${EKODI_INDEXNOW_KEY}.txt`;
export const EKODI_INDEXNOW_KEY_URL=`https://ekodi.kr${EKODI_INDEXNOW_KEY_PATH}`;

export function isEkodiIndexNowKeyPath(pathname){
  return String(pathname||'')===EKODI_INDEXNOW_KEY_PATH;
}

export function ekodiIndexNowKeyResponse(){
  return new Response(EKODI_INDEXNOW_KEY,{
    status:200,
    headers:{
      'content-type':'text/plain; charset=utf-8',
      'cache-control':'public, max-age=86400, immutable',
      'x-content-type-options':'nosniff',
      'x-robots-tag':'noindex, nofollow, noarchive',
      'x-ekodi-route':'platform-indexnow-key',
    },
  });
}
