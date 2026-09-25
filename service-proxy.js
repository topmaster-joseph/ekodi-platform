import { injectEkodiShell } from './ekodi-shell-injector.js';

const EXTERNAL_BIZ_HOSTS=new Set(['ekodibiz.kr','www.ekodibiz.kr']);
const BIZ_CSP=["default-src 'none'","style-src 'unsafe-inline'","img-src data:","frame-ancestors 'none'","base-uri 'none'","form-action 'none'","object-src 'none'"].join('; ');

function businessHub(){
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EKODI BIZ</title></head><body><main><h1>EKODI BIZ</h1><p><a href="https://ekodi.kr/ekodibiz">ekodi.kr/ekodibiz</a></p></main></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300','content-security-policy':BIZ_CSP,'x-ekodi-edge':'business-hub'}});
}

export default{
  async fetch(request){
    const url=new URL(request.url);
    const host=url.hostname.toLowerCase();
    if(EXTERNAL_BIZ_HOSTS.has(host)){
      const target=new URL('https://ekodi.kr/ekodibiz');
      if(url.pathname&&url.pathname!=='/')target.pathname=target.pathname.replace(/\/$/,'')+url.pathname;
      target.search=url.search;
      return Response.redirect(target.toString(),308);
    }
    if(host==='ekodi.kr'&&(url.pathname==='/ekodibiz'||url.pathname==='/ekodibiz/'))return injectEkodiShell(businessHub(),'biz');
    return new Response('Not found',{status:404});
  }
};
