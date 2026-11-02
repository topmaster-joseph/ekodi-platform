import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../my/points/index.html');
const js=read('../my/points/app.js');
const css=read('../my/points/styles.css');

test('personal points has accessible wallet, activity and invite tabs',()=>{
  for(const id of ['wallet','claims','invite']){
    assert.ok(html.includes('data-points-tab="'+id+'"'));
  }
  assert.match(html,/role="tablist"/);
  assert.match(html,/id="pointsWalletPanel" role="tabpanel"/);
  assert.match(html,/id="claimSection" hidden role="tabpanel"/);
  assert.match(html,/id="referralSection" hidden role="tabpanel"/);
  assert.match(js,/pointTabButtons\.forEach/);
  assert.match(js,/event\.key==='ArrowRight'/);
  assert.match(js,/event\.key==='Home'/);
});
test('tabs never override server authorization and responsive widths remain available',()=>{
  assert.match(html,/id="claimSection"[^>]*hidden/);
  assert.match(html,/id="referralSection"[^>]*hidden/);
  assert.match(js,/refreshPointTabState\(\)/);
  assert.doesNotMatch(js,/removeAttribute\('hidden'\)/);
  assert.match(css,/max-width:420px/);
  assert.match(css,/\[aria-selected="true"\]/);
});
