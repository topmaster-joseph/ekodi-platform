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
  // Only the EKODIBIZ operating site may inherit EKODIBIZ's business identity.
  // Every other tenant receives its own display identity; unknown legal details
  // are left empty rather than attributing a different entity's registration.
  const businessHome=(()=>{try{return new URL(url).pathname.replace(/\/+$/,'')==='/ekodibiz'}catch{return false}})();
  const base=EKODI_SITE_CHROME_DEFAULTS.footer;
  const operator=businessHome?{...base.operator}:{
    ...base.operator,name,representative:'',businessRegistrationNumber:'',commerceRegistrationNumber:''
  };
  const contact=businessHome?{...base.contact}:{address:'',email:'',emailHref:''};
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
