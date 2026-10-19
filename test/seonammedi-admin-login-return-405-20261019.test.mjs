// Regression: SeonamMedi "관리자 로그인" on the home page returned to
// https://seonammedi.kr/?admin_view=timeline through a hidden form POST.
// Only /board/* has a server-side POST receiver; the static home page answers
// POST with HTTP 405. Non-board returns must use the fragment handoff (GET).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');

function extract(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' must exist');
  let depth=0,i=source.indexOf('{',start);
  for(;i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)break}
  return source.slice(start,i+1);
}

function simulate(returnTo){
  const calls={post:null,assign:null};
  const form={hidden:false,append(){},submit(){calls.post={method:this.method,action:this.action}}};
  const document={createElement:t=>t==='form'?form:{},body:{append(){}}};
  const location={assign:href=>{calls.assign=href}};
  const code=extract('seonamBoardFormReturn')+'\n'+extract('routeTarget')+'\nreturn routeTarget;';
  const routeTarget=new Function('site','postLoginTarget','document','location',code)(
    'seonammedi',()=>new URL(returnTo),document,location);
  routeTarget({tokenHash:'synthetic-one-use',type:'email'});
  return calls;
}

test('home admin login (timeline/committee) returns by GET fragment, never POST to the static page',()=>{
  for(const view of ['timeline','committee-activity']){
    const calls=simulate('https://seonammedi.kr/?admin_view='+view);
    assert.equal(calls.post,null,'must not form-POST to / (HTTP 405)');
    const target=new URL(calls.assign);
    assert.equal(target.pathname,'/');
    assert.equal(target.searchParams.get('admin_view'),view);
    const frag=new URLSearchParams(target.hash.slice(1));
    assert.equal(frag.get('ekodi_token'),'synthetic-one-use');
    assert.equal(frag.get('ekodi_type'),'email');
  }
});

test('home notice compose login returns by GET fragment',()=>{
  const calls=simulate('https://seonammedi.kr/?compose=notice#notices');
  assert.equal(calls.post,null);
  assert.match(calls.assign,/^https:\/\/seonammedi\.kr\/\?compose=notice#ekodi_token=/);
});

test('board returns keep the server-side form POST (token stays out of the URL)',()=>{
  for(const path of ['/board/notices','/board/voices?compose=1']){
    const calls=simulate('https://seonammedi.kr'+path);
    assert.equal(calls.assign,null);
    assert.equal(calls.post.method,'POST');
    assert.equal(new URL(calls.post.action).pathname,path.split('?')[0]);
  }
});

test('home page consumes the fragment token it is now handed',()=>{
  assert.match(app,/new URLSearchParams\(location\.hash\.replace\(\/\^#\/,''\)\)/);
  assert.match(app,/params\.get\('ekodi_token'\)/);
  assert.match(app,/\/api\/seonammedi\/admin\/auth\/exchange/);
});
