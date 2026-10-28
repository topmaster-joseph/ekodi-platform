// Offline only: callers intercept every browser request into disposable SQLite.
import assert from 'node:assert/strict';
import {loadCooperativeProject} from '../cooperative-store.js';
export async function verifyCooperativeProgress({contextFor,fixture:f,cooperatives,checks,screenshot}) {
  for(const [index,coop] of cooperatives.entries()) for(const width of [320,390,768,1366,1440]) {
    const context=await contextFor(width,index?'admin-open':'admin-jub'),page=await context.newPage();
    const root=`https://ekodi.kr/${coop.publicSlug}/admin#progress`;
    await page.goto(root);await page.waitForSelector('[data-panel="progress"]:not([hidden])');
    assert.equal(await page.locator('[data-progress-key]').count(),33);
    const guide=page.locator('[data-launch-guidance="progress"]');
    assert.equal(await guide.locator('.launch-action').count(),3);
    const card=page.locator('[data-progress-key="01"]'),form=page.locator('#progress-01');
    const open=async()=>{if(!await form.isVisible())await card.locator('summary').click();};await open();
    const submit=async(expected=200)=>{
      const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/project'));
      await form.locator('button[type="submit"]').click();const r=await response;assert.equal(r.status(),expected);
      await page.waitForFunction(expected=>document.querySelector('#status').textContent.includes(expected),expected===200?'저장되었습니다.':'다른 기기');
      if(expected===200)await open();return r.json();
    };
    await form.locator('[name="owner"]').fill('시험 운영담당');
    await form.locator('[name="status"]').selectOption('완료');
    await form.locator('[name="targetDate"]').fill('2026-11-02');
    await form.locator('[name="completedDate"]').fill('');await form.locator('[name="evidence"]').fill('');
    await form.locator('[name="verified"]').check();await submit();
    assert.equal((await loadCooperativeProject(f.db,coop)).state.progress.items[0].verified,false);
    assert.ok((await card.locator('summary').innerText()).includes('증빙확인필요'));
    assert.equal(await guide.locator('.launch-action [data-progress-open]').first().getAttribute('data-progress-open'),'01');
    assert.ok((await page.locator('#progressSaveNext').innerText()).includes('완료일·증빙'));
    await page.locator('#progressFilter').selectOption('review');assert.equal(await page.locator('[data-progress-key]:not([hidden])').count(),1);
    await page.locator('#progressFilter').selectOption('all');
    await form.locator('[name="completedDate"]').fill('2026-10-28');
    await form.locator('[name="evidence"]').fill('시험 동의서 보관기록');
    await form.locator('[name="nextAction"]').fill('다음 준비회의 확인');await form.locator('[name="verified"]').check();
    const saved=await submit();assert.equal(saved.state.progress.items[0].verified,true);
    assert.equal(await guide.locator('.launch-action [data-progress-open]').first().getAttribute('data-progress-open'),'02');
    await page.locator('#progressFilter').selectOption('done');
    await page.locator('#progressSaveNext [data-progress-open]').click();
    assert.equal(await page.locator('#progressFilter').inputValue(),'all');
    assert.equal(await page.locator('[data-progress-key="02"]').evaluate(el=>el.open),true);
    assert.equal(await page.locator('#progress-02').isVisible(),true);
    await open();
    assert.ok((await page.locator('#progressSummary').innerText()).includes('1/33'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,coop.slug+' progress overflow '+width);
    const clickable=await card.locator('summary').boundingBox();assert.ok(clickable.height>=40);
    await screenshot(page,coop.slug+'-progress-'+width);
    await page.reload();await page.waitForSelector('[data-panel="progress"]:not([hidden])');await open();
    assert.equal(await form.locator('[name="owner"]').inputValue(),'시험 운영담당');
    assert.equal(await form.locator('[name="evidence"]').inputValue(),'시험 동의서 보관기록');
    await form.locator('[name="evidence"]').fill('변경한 시험 증빙');await form.locator('[name="verified"]').check();await submit();
    assert.equal((await loadCooperativeProject(f.db,coop)).state.progress.items[0].verified,false);
    await form.locator('[name="verified"]').check();await submit();
    if(width===390){
      const before=await loadCooperativeProject(f.db,coop);
      await guide.locator('[data-guide-agenda]').click();
      assert.equal(await page.locator('#meetingForm [name="title"]').inputValue(),coop.name+' 1차 설립준비회의(초안)');
      assert.ok((await page.locator('#meetingForm [name="body"]').inputValue()).includes('창립총회 의결 기록이 아닙니다'));
      assert.equal(await page.locator('#meetingForm [name="date"]').inputValue(),'');
      assert.equal(await page.locator('#meetingForm [name="status"]').inputValue(),'draft');
      assert.deepEqual(await loadCooperativeProject(f.db,coop),before);
      await page.locator('#meetingForm [name="body"]').fill('사용자가 수정 중인 준비회의 안건');
      await page.getByRole('tab',{name:'출범 진행',exact:true}).click();
      await guide.locator('[data-guide-agenda]').click();
      assert.equal(await page.locator('#meetingForm [name="body"]').inputValue(),'사용자가 수정 중인 준비회의 안건');
      assert.ok((await page.locator('#status').innerText()).includes('입력 중'));
      await page.getByRole('tab',{name:'출범 진행',exact:true}).click();
      await page.locator('[data-launch-guidance="progress"] .launch-action [data-progress-open]').first().click();
      await page.locator('#progress-02 [name="nextAction"]').fill('저장 전 다른 항목의 입력 유지');
      await open();
      await form.locator('[name="owner"]').fill('다른 항목 보존 확인');await submit();
      assert.equal(await page.locator('#progress-02 [name="nextAction"]').inputValue(),'저장 전 다른 항목의 입력 유지');
      await form.locator('[name="nextAction"]').fill('동시 수정 입력 보존');
      f.sqlite.prepare('UPDATE cooperative_projects SET revision=revision+1 WHERE workspace_id=?').run(coop.workspaceId);
      await submit(409);assert.equal(await form.locator('[name="nextAction"]').inputValue(),'동시 수정 입력 보존');
      assert.equal(await page.locator('#meetingForm [name="body"]').inputValue(),'사용자가 수정 중인 준비회의 안건');
      assert.equal(await page.locator('#progressSaveNext [data-progress-open]').getAttribute('data-progress-open'),'02');
    }
    checks.push({surface:'online-launch-checklist',slug:coop.slug,width,items:33,features:['persist-reload','evidence-required','review-cleared-on-change','filter','responsive','next-actions','review-blocks-advance','saved-next-action','filtered-target-opens',...(width===390?['agenda-draft-no-write','agenda-existing-draft-preserved','other-draft-preserved','409-input-preserved']:[])],evidenceScope:'offline-source-synthetic',passed:true});
    await context.close();
  }
}
