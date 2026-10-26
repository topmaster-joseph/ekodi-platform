import { EKODI_USER_FOOTER } from './user-footer.js';
const freeze=value=>Object.freeze(value);

export const EKODI_SITE_CHROME_DEFAULTS=freeze({
  version:1,
  header:freeze({
    siteName:'EKODI',
    tagline:'',
    homeLabel:'홈',
    homeUrl:'',
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
