import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shellCsp } from '../ekodi-shell-injector.js';
import { EKODI_USER_FOOTER, renderEkodiUserFooter } from '../config/user-footer.js';
import { EKODI_USER_EXPERIENCE_PROFILES } from '../config/user-ui-experience-profiles.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('user UI header/footer/language are shared user-surface-only modules',async()=>{
  const [header,footerClient,userLanguage,mediaMeeting,ccmPlayer,legacyMobileHeader,worker,principles,sharedCss,injector,shellPolicy]=await Promise.all([
    read('shell/user-ui-header.js'),
    read('shell/user-ui-footer.js'),
    read('shell/user-language.js'),
    read('shell/media-meeting-adapter.js'),
    read('shell/ccm-mr-player.js'),
    read('shell/mobile-fixed-header.js'),
    read('ekodi-shell-worker.js'),
    read('docs/user-ui-module-principles.md'),
    read('shell/user-ui-shell.css'),
    read('ekodi-shell-injector.js'),
    read('config/user-ui-shell.json')
  ]);

  assert.match(header,/USER_SURFACES=new Set\(\['public','workspace'\]\)/);
  assert.match(header,/DISABLED_MODES=new Set\(\['off','hidden','immersive'\]\)/);
  assert.match(header,/position:fixed!important/);
  assert.match(header,/left:50%!important/);
  assert.match(header,/text-align:center!important/);
  assert.match(header,/data-ekodi-user-header-spacer/);
  assert.match(header,/--ekodi-user-header-height/);
  assert.match(header,/window\.EKODIUserUIHeader/);
  assert.match(header,/ekodi:shell-theme/);
  assert.match(header,/data-ekodi-header-title/);
  assert.doesNotMatch(header,/body\s*\{[^}]*text-align\s*:\s*center/is);

  assert.equal(EKODI_USER_FOOTER.version,3);
  assert.equal(EKODI_USER_FOOTER.operator.businessRegistrationNumber,'213-13-01959');
  assert.equal(EKODI_USER_FOOTER.contact.email,'ekodibiz@gmail.com');
  assert.match(EKODI_USER_FOOTER.precedenceNotice,/별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다/);
  const renderedFooter=renderEkodiUserFooter();
  assert.match(renderedFooter,/data-ekodi-user-footer="v3"/);
  assert.match(renderedFooter,/data-ekodi-legal-footer="user-shell-v2"/);
  assert.match(renderedFooter,/ekodi-user-ui-footer__copy/);
  assert.match(renderedFooter,/data-ekodi-i18n="privacy"/);
  assert.match(renderedFooter,/data-ekodi-i18n="terms"/);
  assert.match(renderedFooter,/data-ekodi-i18n="contact"/);

  assert.match(worker,/userHeaderUrl\.pathname='\/user-ui-header\.js'/);
  assert.match(worker,/userFooterUrl\.pathname='\/user-ui-footer\.js'/);
  assert.match(worker,/userLanguageUrl\.pathname='\/user-language\.js'/);
  assert.match(worker,/mediaMeetingUrl\.pathname='\/media-meeting-adapter\.js'/);
  assert.match(worker,/USER_FOOTER_BOOTSTRAP/);
  assert.match(worker,/\/user-footer\.json/);
  assert.match(worker,/x-ekodi-user-ui-footer/);
  assert.match(worker,/x-ekodi-user-language/);
  assert.match(legacyMobileHeader,/if\(window\.__EKODI_USER_UI_HEADER_BOOTED\)return/);

  assert.match(footerClient,/const VERSION=5/);
  assert.match(footerClient,/__EKODI_USER_FOOTER_CONFIG__/);
  assert.match(footerClient,/user-footer\.json/);
  assert.match(footerClient,/ekodi-user-ui-footer__copy/);
  assert.match(footerClient,/data-ekodi-i18n/);
  assert.match(footerClient,/applyReadableFooter/);
  assert.match(footerClient,/--ekodi-user-footer-safe-text/);
  assert.match(footerClient,/dataset\.ekodiFooterContrast/);
  assert.doesNotMatch(footerClient,/213-13-01959/);
  assert.doesNotMatch(footerClient,/백련동1길 17-4/);
  assert.doesNotMatch(footerClient,/© 2026 EKODI · EKODIBIZ/);

  assert.match(userLanguage,/const VERSION=5/);
  assert.match(userLanguage,/const COOKIE_KEY='ekodi_locale'/);
  assert.match(userLanguage,/data-ekodi-language-control/);
  assert.match(userLanguage,/document\.documentElement\.lang=next/);
  assert.match(userLanguage,/ekodi:locale-change/);
  assert.match(userLanguage,/ko-KR/);
  assert.match(userLanguage,/zh-CN/);
  assert.match(userLanguage,/window\.EKODIUserLanguage/);
  assert.match(userLanguage,/-webkit-text-fill-color:#20362b!important/);
  assert.match(header,/data-ekodi-header-home/);
  assert.match(header,/serviceHomeUrl/);
  assert.match(header,/bindHomeAnchor\(header\)/);
  assert.match(userLanguage,/notranslate/);
  assert.match(injector,/name=\"google\" content=\"notranslate\"/);
  assert.match(userLanguage,/locale:'ne'/);

  assert.match(mediaMeeting,/const VERSION=2/);
  assert.match(mediaMeeting,/window\.EKODIMediaMeetingAdapter/);
  assert.match(mediaMeeting,/social\.ekodi\.kr\/api\/media\/youtube\/status/);
  assert.match(mediaMeeting,/POLL_MS=60_000/);
  assert.match(mediaMeeting,/data-ekodi-meeting-provider=\"jitsi\"/);
  assert.match(mediaMeeting,/data-ekodi-media-provider=\"youtube\"/);
  assert.match(mediaMeeting,/config\.defaultLanguage/);
  assert.match(mediaMeeting,/Preparing the next broadcast/);

  assert.match(ccmPlayer,/dataset\.ekodiCcmMr='v2'/);
  assert.match(ccmPlayer,/background:#fbfcfa!important/);
  assert.match(ccmPlayer,/aria-pressed="true"/);

  assert.match(sharedCss,/\.ekodi-user-ui-header\s*\{/);
  assert.match(sharedCss,/position:\s*fixed\s*!important/);
  assert.match(sharedCss,/\.ekodi-user-ui-footer\s*\{/);
  assert.match(sharedCss,/text-align:\s*center/);
  assert.match(sharedCss,/justify-content:\s*center/);
  assert.match(sharedCss,/\.ekodi-user-language\s*\{/);
  assert.match(sharedCss,/--ekodi-user-header-inline-gutter/);
  assert.match(sharedCss,/Selective geometry principle/);
  assert.match(sharedCss,/consumer-commerce/);
  assert.match(sharedCss,/body > \[data-ekodi-user-footer\] ~ \[data-ekodi-user-footer\]/);
  assert.match(footerClient,/dedupeSharedFooters/);
  assert.match(footerClient,/observeFooterChanges/);
  assert.match(sharedCss,/z-index:\s*2147483400/);
  assert.match(sharedCss,/overflow:\s*visible/);
  assert.match(userLanguage,/z-index:2147483400!important/);
  assert.match(sharedCss,/background:\s*var\(--ekodi-user-footer-background/);
  assert.match(sharedCss,/color:\s*var\(--ekodi-user-footer-text,\s*inherit\)/);
  assert.match(sharedCss,/font-family:\s*inherit/);
  assert.match(sharedCss,/\.ekodi-user-ui-footer__scope/);
  assert.match(sharedCss,/\[data-ekodi-legal-footer\]:not\(\.ekodi-user-ui-footer\)/);
  assert.doesNotMatch(sharedCss,/\.ekodi-user-ui-footer\s*\{[^}]*rgba\(250,\s*250,\s*247/is);
  assert.doesNotMatch(sharedCss,/\.ekodi-user-ui-footer\s*\{[^}]*rgba\(16,\s*21,\s*18/is);

  assert.match(injector,/SHELL_USER_UI_STYLE=`\$\{SHELL_ORIGIN\}\/user-ui-shell\.css`/);
  assert.match(injector,/renderEkodiUserFooter/);
  assert.match(injector,/data-ekodi-user-ui-style/);
  assert.doesNotMatch(injector,/213-13-01959/);
  assert.doesNotMatch(injector,/백련동1길 17-4/);
  assert.doesNotMatch(injector,/data-ekodi-user-ui-shell-style/);

  const parsedPolicy=JSON.parse(shellPolicy);
  assert.equal(parsedPolicy.footer.contentSource,'config/user-footer.js');
  assert.equal(parsedPolicy.footer.alignment,'center');
  assert.equal(parsedPolicy.footer.dedupe,'exactly-one-shared-footer');
  assert.equal(parsedPolicy.header.alignment,'centered-canvas');
  assert.equal(parsedPolicy.principles.selectiveRoundedInteraction,true);
  assert.equal(parsedPolicy.experienceProfiles.source,'config/user-ui-experience-profiles.js');
  assert.equal(parsedPolicy.experienceProfiles.strategy,'service-opt-in');
  assert.equal(EKODI_USER_EXPERIENCE_PROFILES.serviceProfiles.mall,'consumer-commerce');
  assert.equal(EKODI_USER_EXPERIENCE_PROFILES.profiles['consumer-commerce'].geometry.controlRadius,'999px');
  assert.match(worker,/USER_EXPERIENCE_PROFILES_BOOTSTRAP/);
  assert.match(worker,/x-ekodi-user-experience-profiles/);
  assert.match(parsedPolicy.footer.layout,/centered/);
  assert.match(parsedPolicy.footer.themePolicy,/inherit each service/);
  assert.equal(parsedPolicy.language.owner,'shared-shell');
  assert.equal(parsedPolicy.language.adminExcluded,true);
  assert.deepEqual(parsedPolicy.language.supported,['ko-KR','en','zh-CN','ja','ne','vi']);

  assert.match(principles,/consumer-commerce/);

  const strictCsp=shellCsp("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'");
  assert.match(strictCsp,/style-src 'self' https:\/\/shell\.ekodi\.kr/);
  assert.doesNotMatch(strictCsp,/style-src[^;]*'unsafe-inline'/);

  assert.match(principles,/관리자 화면\(`admin`\)/);
  assert.match(principles,/각 사이트의 브랜드, 목적, 사용자 흐름/);
});
