import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const headers=fs.readFileSync(new URL('../_headers',import.meta.url),'utf8');
function rule(path){
  const lines=headers.split('\n');const i=lines.indexOf(path);
  assert.ok(i>=0,`missing _headers rule for ${path}`);
  const body=[];for(let k=i+1;k<lines.length&&/^\s/.test(lines[k]);k++)body.push(lines[k].trim());
  return body;
}

// The site-wide default CSP is script-src 'none'. Without these rules the booth pages render but
// their scripts never run, so members and the secretary stay on "불러오는 중" forever.
test('booth pages override the site-wide no-script CSP and are never cached',()=>{
  for(const path of ['/cgmurrc/booth/','/cgmurrc/booth/*']){
    const body=rule(path);
    assert.ok(body.includes('! Content-Security-Policy'),path);
    const csp=body.find(l=>l.startsWith('Content-Security-Policy:'));
    assert.match(csp,/script-src 'self';/,path);
    assert.doesNotMatch(csp,/'unsafe-inline'[^;]*;?\s*$|script-src[^;]*'unsafe-inline'/,'no inline scripts');
    assert.ok(body.includes('! Cache-Control')&&body.includes('Cache-Control: no-store'),path);
  }
  const admin=rule('/cgmurrc/booth/*').find(l=>l.startsWith('Content-Security-Policy:'));
  assert.match(admin,/connect-src 'self' https:\/\/renzehysxirjilvdxacv\.supabase\.co;/,'admin sign-in exchange');
});

test('header-only changes dispatch the Site Core deploy after a convergent merge',()=>{
  const script=fs.readFileSync(new URL('../scripts/converge-orchestrated-pr-merge.mjs',import.meta.url),'utf8');
  const block=script.slice(script.indexOf('const sharedSiteTouched'),script.indexOf('\n);',script.indexOf('const sharedSiteTouched')));
  assert.ok(block.includes("file==='_headers'"));
});
