import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const GROUP_URL='https://www.facebook.com/groups/2299276407568855';

test('social group source is managed in communication channels without duplicate related-news card',async()=>{
  const [html,css,admin]=await Promise.all([
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/app.css'),
    read('sites/seonammedi/public/admin/index.html')
  ]);
  assert.doesNotMatch(html,/class="related-linked-channels"/);
  assert.doesNotMatch(html,/class="related-facebook-source"/);
  assert.match(html,/id="channels" class="section"/);
  assert.match(html,/id="publicChannelTabs"/);
  assert.match(html,/id="publicNewsCategories"[^>]*>[\s\S]*?<option value="페이스북 그룹">/);
  assert.match(html,/name="category"[^>]*>[\s\S]*?<option>페이스북 그룹<\/option>/);
  // Owner 2026-10-19: related news is managed on the public page, not the admin console.
  assert.doesNotMatch(admin,/id="timelineForm"/);
  assert.match(css,/\.related-facebook-source\{/);
});

test('the Facebook group is a specific subcategory; general Facebook includes its posts',async()=>{
  const js=await read('sites/seonammedi/public/app.js');
  const a=js.indexOf('const TIMELINE_FILTERS=');
  const b=js.indexOf('const timelineDateKey=');
  const c=js.indexOf('const relatedNewsFilterMatches=');
  const d=js.indexOf('function renderPublicTimeline(){');
  assert.ok(a>=0&&b>a&&c>b&&d>c,'related news category and filter logic present');
  const taxonomy=js.slice(a,b)+'\n'+js.slice(c,d);
  const {relatedNewsCategory,relatedNewsFilterMatches,group}=runInNewContext(taxonomy+'\n({relatedNewsCategory,relatedNewsFilterMatches,group:RELATED_FACEBOOK_GROUP})');
  assert.equal(group.url,GROUP_URL);
  assert.equal(group.id,'2299276407568855');
  const linked={category:'페이스북',links:[{url:GROUP_URL+'/posts/321',source:'Facebook'}]};
  assert.equal(relatedNewsCategory(linked),'페이스북 그룹');
  assert.equal(relatedNewsFilterMatches(linked,'페이스북 그룹'),true);
  assert.equal(relatedNewsFilterMatches(linked,'페이스북'),true);
  const otherFacebook={category:'페이스북',links:[{url:'https://www.facebook.com/some-page/posts/321'}]};
  assert.equal(relatedNewsCategory(otherFacebook),'페이스북');
  assert.equal(relatedNewsFilterMatches(otherFacebook,'페이스북 그룹'),false);
  assert.equal(relatedNewsFilterMatches(otherFacebook,'페이스북'),true);
  assert.equal(relatedNewsCategory({category:'페이스북 그룹',links:[]}), '페이스북 그룹');
  assert.equal(relatedNewsFilterMatches({category:'신문'},'페이스북 그룹'),false);
  assert.match(js,/검증되어 공개된 그룹 게시물이 없습니다/);
});

test('group source does not fabricate published timeline entries or pretend scraping access',async()=>{
  const [html,js]=await Promise.all([
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/app.js')
  ]);
  assert.match(js,/const relatedRows=publicTimelineEntries\.filter\(item=>!isCommitteeRecord\(item\)&&!isCommitteeRelatedNews\(item\)\)/);
  assert.match(js,/filter\(item=>relatedNewsFilterMatches\(item,activeTimelineCategory\)\)/);
  assert.doesNotMatch(html,/class="related-facebook-source"/);
  assert.match(html,/id="publicChannelAccounts"/);
});
