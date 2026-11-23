import { EKODI_USER_FOOTER } from './user-footer.js';
const freeze=value=>Object.freeze(value);

export const EKODI_SITE_CHROME_DEFAULTS=freeze({
  version:1,
  header:freeze({
    siteName:'EKODI',
    tagline:'',
    homeLabel:'홈',
    homeUrl:'',
    // 회계공지 메뉴의 노출 여부. 원칙은 각 사용자 사이트에 모두 공지하는 것이므로
    // 기본값은 켜짐이고, 사이트관리자(자기 사이트 폼)와 최고관리자(PUT
    // /api/control/site-chrome/<slug>)가 끌 수 있다. 끄는 것은 메뉴 노출만
    // 가리는 것이고, 공개 집계 API 자체의 권한 경계와는 별개다.
    accountingNotice:true,
  }),
  footer:freeze({
    ...EKODI_USER_FOOTER,
    operator:freeze({...EKODI_USER_FOOTER.operator}),
    contact:freeze({...EKODI_USER_FOOTER.contact}),
    legalLinks:freeze(EKODI_USER_FOOTER.legalLinks.map(item=>freeze({...item}))),
    ariaLabel:'사이트 운영 및 법적 고지',
  }),
});

export function siteChromeDefaults(siteName='',homeUrl=''){
  const name=String(siteName||'').trim()||EKODI_SITE_CHROME_DEFAULTS.header.siteName;
  const url=String(homeUrl||'').trim();
  // Only verified first-party sites directly operated by EKODIBIZ can display
  // its business registration. Independent tenants never inherit that identity.
  // The Mall is EKODIBIZ's direct-selling service (see /terms and /ekodibiz/refund).
  const ekodibizOperated=(()=>{
    try{
      const parsed=new URL(url);
      const path=parsed.pathname.replace(/\/+$/,'')||'/';
      return parsed.origin==='https://ekodi.kr'&&new Set(['/ekodibiz','/ekodimall']).has(path);
    }catch{return false;}
  })();
  const base=EKODI_SITE_CHROME_DEFAULTS.footer;
  const operator=ekodibizOperated?{...base.operator}:{
    ...base.operator,name,representative:'',businessRegistrationNumber:'',commerceRegistrationNumber:''
  };
  const contact=ekodibizOperated?{...base.contact}:{address:'',email:'',emailHref:''};
  return {
    version:EKODI_SITE_CHROME_DEFAULTS.version,
    header:{...EKODI_SITE_CHROME_DEFAULTS.header,siteName:name,homeUrl:url},
    footer:{
      ...base,
      brand:name,
      operator,
      contact,
      copyright:`© ${new Date().getFullYear()} EKODI (에코디). All rights reserved.`,
      precedenceNotice:'사이트 운영정보 및 별도 정책은 해당 사이트의 운영주체를 기준으로 합니다.',
      legalLinks:base.legalLinks.map(item=>({...item})),
    },
  };
}
