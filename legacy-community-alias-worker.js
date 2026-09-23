const CANONICAL_ORIGIN='https://ekodi.kr';
const CANONICAL_PREFIX='/community';

function targetFor(request){
  const source=new URL(request.url);
  const target=new URL(CANONICAL_PREFIX+'/',CANONICAL_ORIGIN);
  const path=source.pathname==='/'?'':source.pathname.replace(/^\/+/, '');
  target.pathname=path?CANONICAL_PREFIX+'/'+path:CANONICAL_PREFIX+'/';
  target.search=source.search;
  return target;
}

export default {
  async fetch(request){
    const target=targetFor(request);
    if(!['GET','HEAD'].includes(request.method)){
      return new Response(JSON.stringify({error:'legacy_alias_read_only',canonical:target.toString()}),{
        status:410,
        headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','location':target.toString(),'x-content-type-options':'nosniff'}
      });
    }
    return new Response(null,{status:308,headers:{location:target.toString(),'cache-control':'public, max-age=300','x-content-type-options':'nosniff','x-ekodi-legacy-alias':'community.ekodi.kr'}});
  }
};
