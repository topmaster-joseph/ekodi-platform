const SHELL_ORIGIN='https://shell.ekodi.kr';
const SHELL_SCRIPT=`${SHELL_ORIGIN}/shell.js`;

function extendDirective(csp,name,value){
  const parts=String(csp||'').split(';').map(v=>v.trim()).filter(Boolean);
  const index=parts.findIndex(part=>part===name||part.startsWith(`${name} `));
  if(index<0){parts.push(`${name} 'self' ${value}`);return parts.join('; ')}
  if(!parts[index].split(/\s+/).includes(value))parts[index]=`${parts[index]} ${value}`;
  return parts.join('; ');
}

function shellCsp(csp){
  let next=String(csp||'').trim();
  if(!next)next="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'";
  next=extendDirective(next,'script-src',SHELL_ORIGIN);
  next=extendDirective(next,'connect-src',SHELL_ORIGIN);
  return next;
}

class HeadInjector{
  constructor(serviceId){this.serviceId=serviceId;}
  element(element){
    const service=String(this.serviceId||'').replace(/[^a-z0-9-]/g,'');
    element.prepend(`<script src="${SHELL_SCRIPT}" data-ekodi-service="${service}"></script>`,{html:true});
  }
}

export function injectEkodiShell(response,serviceId){
  if(!response||!serviceId)return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html'))return response;
  const headers=new Headers(response.headers);
  headers.set('content-security-policy',shellCsp(headers.get('content-security-policy')));
  headers.set('x-ekodi-shell','v1');
  const transformed=new HTMLRewriter().on('head',new HeadInjector(serviceId)).transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers}));
  return transformed;
}

export function shellServiceForHost(hostname){
  const host=String(hostname||'').toLowerCase();
  const exact={
    'my.ekodi.kr':'my','marketing.ekodi.kr':'marketing','community.ekodi.kr':'community','church.ekodi.kr':'church','business.ekodi.kr':'business','biz.ekodi.kr':'biz','work.ekodi.kr':'work','author.ekodi.kr':'author','books.ekodi.kr':'books','lab.ekodi.kr':'lab','social.ekodi.kr':'social','energy.ekodi.kr':'energy','mall.ekodi.kr':'mall','mall.biz.ekodi.kr':'mall','trade.ekodi.kr':'trade','trade.biz.ekodi.kr':'trade','pay.ekodi.kr':'pay','pay.biz.ekodi.kr':'pay','edu.ekodi.kr':'edu','media.ekodi.kr':'media'
  };
  return exact[host]||'';
}

export { SHELL_ORIGIN, SHELL_SCRIPT, shellCsp };
