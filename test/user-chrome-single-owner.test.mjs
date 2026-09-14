import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('shared user chrome carries a response ownership marker and skips duplicate chrome injection',async()=>{
  const injector=await read('ekodi-shell-injector.js');

  assert.match(injector,/const USER_CHROME_HEADER='x-ekodi-user-chrome'/);
  assert.match(injector,/function userChromeAlreadyInjected\(headers\)/);
  assert.match(injector,/const alreadyHasChrome=userChromeAlreadyInjected\(response\.headers\)/);
  assert.match(injector,/headers\.set\(USER_CHROME_HEADER,USER_UI_VERSION\)/);
  assert.match(injector,/if\(!alreadyHasChrome\)\{/);
  assert.match(injector,/\.on\('footer',new UserFooterCanonicalizer\(serviceId\)\)/);
  assert.match(injector,/\.on\('body',new UserChromeInjector\(serviceId\)\)/);
});
