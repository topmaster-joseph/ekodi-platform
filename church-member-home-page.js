const MEMBER_HOME='/ekodichurch/my';
const MEMBER_HOME_CANONICAL='/ekodichurch/my/';

export function isChurchMemberHomePath(pathname){
  return String(pathname||'')===MEMBER_HOME;
}

export function churchMemberHomePage(request=new Request('https://ekodi.kr/ekodichurch/my')){
  const source=new URL(request.url);
  const target=new URL(MEMBER_HOME_CANONICAL,source.origin);
  target.search=source.search;
  const headers=new Headers({
    location:target.href,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer',
    'x-robots-tag':'noindex, nofollow, noarchive',
    'x-ekodi-route':'church-member-canonical-redirect',
    'x-ekodi-authority-scope':'user'
  });
  return new Response(null,{status:308,headers});
}
