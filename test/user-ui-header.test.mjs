import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shellCsp } from '../ekodi-shell-injector.js';
import { EKODI_USER_FOOTER, renderEkodiUserFooter } from '../config/user-footer.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('user UI header/footer are shared user-surface-only modules',async()=>{
  const [header,footerClient,legacyMobileHeader,worker,principles,sharedCss,injector,shellPolicy]=await Promise.all([
    read('shell/user-ui-header.js'),
    read('shell/user-ui-footer.js'),
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

  assert.equal(EKODI_USER_FOOTER.version,2);
  assert.equal(EKODI_USER_FOOTER.operator.businessRegistrationNumber,'213-13-01959');
  assert.equal(EKODI_USER_FOOTER.contact.email,'ekodibiz@gmail.com');
  assert.match(EKODI_USER_FOOTER.precedenceNotice,/별도 정책이 표시된 경우 해당 정책이 우선 적용됩니다/);
  const renderedFooter=renderEkodiUserFooter();
  assert.match(renderedFooter,/data-ekodi-user-footer="v2"/);
  assert.match(renderedFooter,/data-ekodi-legal-footer="user-shell-v2"/);
  assert.match(renderedFooter,/ekodi-user-ui-footer__copy/);
  assert.match(renderedFooter,/개인정보처리방침/);
  assert.match(renderedFooter,/이용약관/);

  assert.match(worker,/userHeaderUrl\.pathname='\/user-ui-header\.js'/);
  assert.match(worker,/userFooterUrl\.pathname='\/user-ui-footer\.js'/);
  assert.match(worker,/USER_FOOTER_BOOTSTRAP/);
  assert.match(worker,/\/user-footer\.json/);
  assert.match(worker,/x-ekodi-user-ui-footer/);
  assert.match(legacyMobileHeader,/if\(window\.__EKODI_USER_UI_HEADER_BOOTED\)return/);

  assert.match(footerClient,/const VERSION=2/);
  assert.match(footerClient,/__EKODI_USER_FOOTER_CONFIG__/);
  assert.match(footerClient,/user-footer\.json/);
  assert.match(footerClient,/ekodi-user-ui-footer__copy/);
  assert.doesNotMatch(footerClient,/213-13-01959/);
  assert.doesNotMatch(footerClient,/백련동1길 17-4/);
  assert.doesNotMatch(footerClient,/© 2026 EKODI · EKODIBIZ/);

  assert.match(sharedCss,/\.ekodi-user-ui-header\s*\{/);
  assert.match(sharedCss,/position:\s*fixed\s*!important/);
  assert.match(sharedCss,/\.ekodi-user-ui-footer\s*\{/);
  assert.match(sharedCss,/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  assert.match(sharedCss,/background:\s*var\(--ekodi-user-footer-background,\s*transparent\)/);
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
  assert.match(parsedPolicy.footer.layout,/operator-copy-left/);
  assert.match(parsedPolicy.footer.layout,/legal-links-right/);
  assert.match(parsedPolicy.footer.themePolicy,/inherit each service/);

  const strictCsp=shellCsp("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'");
  assert.match(strictCsp,/style-src 'self' https:\/\/shell\.ekodi\.kr/);
  assert.doesNotMatch(strictCsp,/style-src[^;]*'unsafe-inline'/);

  assert.match(principles,/중앙 정렬 원칙은 \*\*헤더 영역에만\*\* 적용한다/);
  assert.match(principles,/관리자 화면\(`admin`\)/);
  assert.match(principles,/각 사이트의 브랜드, 목적, 사용자 흐름/);
});
