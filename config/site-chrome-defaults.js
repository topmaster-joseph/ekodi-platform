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
  return {
    version:EKODI_SITE_CHROME_DEFAULTS.version,
    header:{...EKODI_SITE_CHROME_DEFAULTS.header,siteName:name,homeUrl:url},
    footer:{
      ...EKODI_SITE_CHROME_DEFAULTS.footer,
      operator:{...EKODI_SITE_CHROME_DEFAULTS.footer.operator},
      contact:{...EKODI_SITE_CHROME_DEFAULTS.footer.contact},
      legalLinks:EKODI_SITE_CHROME_DEFAULTS.footer.legalLinks.map(item=>({...item})),
    },
  };
}
