// Functional evidence uses only the source runner's offline browser and
// disposable SQLite. No synthetic bearer is ever sent to the production host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadCooperativeProject } from '../cooperative-store.js';

const tabs = ['현황', '출범 진행', '조합정보', '구성원·사업자', '설립서류', '총회·신고 일정', '공지', '회의록', '지원사업', '계정·권한'];
const panelIds = ['overview', 'progress', 'profile', 'founders', 'documents', 'schedule', 'notices', 'meetings', 'supports', 'accounts'];

export async function verifyCooperativeServiceWorkflows({ contextFor, fixture: f, cooperatives, checks, screenshot }) {
  const read = coop => loadCooperativeProject(f.db, coop);
  const submit = async (page, form) => {
    await page.locator('#' + form + ' button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('저장되었습니다.'));
  };
  const tab = (page, name) => page.getByRole('tab', { name, exact: true }).click();
  const reload = async page => {
    await page.reload();
    await page.waitForSelector('#workspace:not([hidden])');
  };
  const download = async (page, button) => {
    const pending = page.waitForEvent('download');
    await page.locator(button).click();
    const file = await pending;
    return { filename: file.suggestedFilename(), text: await fs.readFile(await file.path(), 'utf8') };
  };
  const proof = (coop, feature, detail = {}) => checks.push({ surface: 'service-function', slug: coop.slug, feature, evidenceScope: 'offline-source-synthetic', passed: true, ...detail });

  for (const [index, coop] of cooperatives.entries()) {
    const root = 'https://ekodi.kr/' + coop.publicSlug;
    const other = cooperatives[1 - index];
    const adminToken = index === 0 ? 'admin-jub' : 'admin-open';
    const memberToken = index === 0 ? 'member-jub' : 'member-open';
    const otherBefore = JSON.stringify(await read(other));
    const context = await contextFor(1440, adminToken);
    const page = await context.newPage();
    await page.goto(root + '/admin');
    await page.waitForSelector('#workspace:not([hidden])');

    // Every real admin panel, at the full responsive-contract device matrix.
    for (const width of [320, 390, 768, 1366, 1440]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 950 });
      for (const [i, label] of tabs.entries()) {
        await tab(page, label);
        assert.equal(await page.locator('[data-panel="' + panelIds[i] + '"]').isVisible(), true);
        assert.equal(await page.locator('[data-panel]:visible').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, coop.slug + ' ' + label + ' overflow at ' + width);
      }
      proof(coop, 'all-nine-admin-tabs-reflow', { width, tabs: tabs.length });
      await tab(page,'설립서류');
      assert.equal(await page.locator('[data-preparation-id]').count(),2);
      assert.equal(await page.locator('#preparation-09 textarea').getAttribute('maxlength'),'2000');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      await screenshot(page,coop.slug+'-preparation-'+width);
      proof(coop,'private-preparation-drafts-responsive',{width});
    }

    await tab(page, '조합정보');
    const purpose = coop.name + ' 기능 실증용 목적';
    await page.locator('#profileForm [name="purpose"]').fill(purpose);
    await page.locator('#profileForm [name="firstYearBudget"]').fill('');
    await submit(page, 'profileForm');
    await reload(page); await tab(page, '조합정보');
    assert.equal(await page.locator('#profileForm [name="purpose"]').inputValue(), purpose);
    assert.equal((await read(coop)).state.profile.firstYearBudget, null);
    proof(coop, 'profile-save-reload-and-null-budget');

    await tab(page, '구성원·사업자');
    const business = coop.name + ' 실증 사업체';
    await page.locator('#foundersForm [data-key="business"]').first().fill(business);
    for (const input of await page.locator('#foundersForm [data-key="shares"]').all()) await input.fill('1');
    await submit(page, 'foundersForm');
    await reload(page); await tab(page, '구성원·사업자');
    assert.equal(await page.locator('#foundersForm [data-key="business"]').first().inputValue(), business);
    assert.deepEqual((await read(coop)).state.founders.map(row => row.shares), [1, 1, 1, 1, 1]);
    proof(coop, 'founders-business-and-capital-save-reload');

    await tab(page, '설립서류');
    await page.locator('#doc-charter').selectOption('reviewed');
    await page.locator('#documentsForm [name="charter-note"]').fill('초안 대조 완료 · 실증');
    await submit(page, 'documentsForm');
    await reload(page); await tab(page, '설립서류');
    assert.equal(await page.locator('#doc-charter').inputValue(), 'reviewed');
    assert.equal(await page.locator('#documentsForm [name="charter-note"]').inputValue(), '초안 대조 완료 · 실증');
    const charter = await download(page, '#charter');
    assert.equal(charter.filename, coop.publicSlug + '-charter-draft.txt');
    assert.ok(charter.text.includes(coop.name)); assert.ok(charter.text.includes(purpose));
    assert.ok(charter.text.includes(coop.representatives[0]));
    // The provenance paragraph legitimately names the supplied source charter.
    // Verify this cooperative's actual title and naming clause instead.
    assert.ok(charter.text.includes('\n' + coop.name + ' / 설립용 명칭(안): ' + coop.legalName + '\n'));
    assert.ok(charter.text.includes('제1조(설립과 명칭) 이 조합은 협동조합기본법에 의하여 설립하며, ' + coop.legalName + '이라 한다.'));
    proof(coop, 'document-status-memo-reload-and-charter-download');

    const plan=page.locator('#preparation-09 [name="body"]'),budget=page.locator('#preparation-10 [name="body"]');
    await tab(page,'출범 진행');await page.locator('[data-progress-key="09"] summary').click();
    assert.equal(await page.locator('#progress-09 [name="note"]').getAttribute('maxlength'),'2000');
    await page.locator('#progress-09 [name="note"]').fill('진행 화면에서 작성한 미저장 원본');
    await tab(page,'조합정보');await submit(page,'profileForm');await tab(page,'설립서류');
    assert.equal(await plan.inputValue(),'진행 화면에서 작성한 미저장 원본');
    assert.equal(await page.locator('#progress-09 [name="note"]').inputValue(),'진행 화면에서 작성한 미저장 원본');
    await page.locator('[data-preparation-template="09"]').click();assert.equal(await plan.inputValue(),'진행 화면에서 작성한 미저장 원본');
    await page.locator('.preparation-packet summary').click();await page.locator('[data-preparation-export]').click();
    assert.ok((await page.locator('#status').innerText()).includes('먼저 저장'));
    await plan.fill('');
    const beforeDraft=await read(coop);
    await page.locator('[data-preparation-template="09"]').click();
    assert.ok((await plan.inputValue()).includes(coop.name+' 사업계획 검토용 초안'));
    assert.deepEqual(await read(coop),beforeDraft,'loading a worksheet cannot write');
    const planText=await plan.inputValue()+'\n'+coop.publicSlug+'-private-plan <img src=x onerror="window.__draftExecuted=true">';
    await plan.fill(planText);
    await page.locator('[data-preparation-template="09"]').click();assert.equal(await plan.inputValue(),planText);
    assert.ok((await page.locator('#status').innerText()).includes('이미 작성'));
    await page.locator('[data-preparation-template="10"]').click();
    const budgetText=await budget.inputValue()+'\n사업 금액 미정 · 추가 검토';await budget.fill(budgetText);
    await submit(page,'preparation-09');assert.equal(await budget.inputValue(),budgetText,'other draft must remain');
    assert.equal((await read(coop)).state.progress.items[8].note,planText);
    assert.deepEqual((await read(coop)).state.documents,beforeDraft.state.documents);
    await page.locator('.preparation-packet summary').click();
    await page.locator('[data-preparation-export]').click();
    assert.ok((await page.locator('#status').innerText()).includes('먼저 저장'));
    await submit(page,'preparation-10');await reload(page);await tab(page,'설립서류');
    assert.equal(await plan.inputValue(),planText);assert.equal(await budget.inputValue(),budgetText);
    assert.equal(await page.evaluate(()=>window.__draftExecuted===true),false);
    await page.locator('.preparation-packet summary').click();
    assert.ok((await page.locator('#preparationPacketText').innerText()).includes(planText));
    const packet=await download(page,'[data-preparation-export]');
    assert.equal(packet.filename,coop.publicSlug+'-preparation-drafts.txt');assert.ok(packet.text.includes(coop.name));assert.ok(packet.text.includes(planText));assert.ok(packet.text.includes(budgetText));
    assert.equal(packet.text.includes('@example.test'),false);assert.equal(packet.text.includes(other.name),false);
    await tab(page,'출범 진행');await page.locator('[data-progress-key="09"] summary').click();
    const progressPlan=page.locator('#progress-09');
    assert.equal(await progressPlan.locator('[name="note"]').inputValue(),planText);
    await progressPlan.locator('[name="status"]').selectOption('완료');await progressPlan.locator('[name="completedDate"]').fill('2026-10-28');
    await progressPlan.locator('[name="evidence"]').fill('오프라인 시험 사업계획 근거');await progressPlan.locator('[name="verified"]').check();
    await submit(page,'progress-09');assert.equal((await read(coop)).state.progress.items[8].verified,true);
    await tab(page,'설립서류');await plan.fill(planText+'\n추가 검토');
    assert.equal(await page.locator('#progress-09 [name="note"]').inputValue(),planText+'\n추가 검토');
    await submit(page,'preparation-09');assert.equal((await read(coop)).state.progress.items[8].verified,false);
    await page.setViewportSize({width:390,height:844});
    await page.locator('.preparation-packet summary').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await screenshot(page,coop.slug+'-preparation-saved-390');
    await page.setViewportSize({width:1440,height:950});
    proof(coop,'private-plan-budget-create-reload-sync-packet-and-review-reset',{maxLength:2000,unsavedTemplateWrites:0});

    await tab(page, '총회·신고 일정');
    const dates = { foundingMeetingDate: '2026-11-20', filingDate: '2026-11-23', confirmationDate: '2026-12-01', capitalPaidDate: '2026-12-02', registrationDate: '2026-12-10' };
    for (const [name, value] of Object.entries(dates)) await page.locator('#datesForm [name="' + name + '"]').fill(value);
    await submit(page, 'datesForm'); await reload(page); await tab(page, '총회·신고 일정');
    for (const [name, value] of Object.entries(dates)) assert.equal(await page.locator('#datesForm [name="' + name + '"]').inputValue(), value);
    assert.deepEqual(await page.locator('[data-panel="schedule"] .deadline-list b').allTextContents(), ['2026-11-12', '2026-12-13', '2026-12-16']);
    proof(coop, 'all-five-dates-persist-and-reference-calculations');

    const kinds = [
      { tab: '공지', form: 'noticeForm', kind: 'notices', textField: 'body' },
      { tab: '회의록', form: 'meetingForm', kind: 'meetings', textField: 'body' },
      { tab: '지원사업', form: 'supportForm', kind: 'supports', textField: 'memo' },
    ];
    for (const item of kinds) {
      await tab(page, item.tab);
      const title = coop.name + ' ' + item.tab + ' 실증';
      await page.locator('#' + item.form + ' [name="title"]').fill(title);
      await page.locator('#' + item.form + ' [name="' + item.textField + '"]').fill('첫 번째 기록');
      if (item.kind === 'meetings') await page.locator('#meetingForm [name="date"]').fill('2026-11-20');
      if (item.kind === 'supports') {
        await page.locator('#supportForm [name="agency"]').fill('가상 실증 기관');
        await page.locator('#supportForm [name="deadline"]').fill('2026-11-30');
      }
      await submit(page, item.form);
      let row = (await read(coop)).state[item.kind].find(row => row.title === title);
      assert.ok(row);
      const rowId = row.id;
      await page.locator('[data-edit="' + item.kind + '"][data-record="' + rowId + '"]').click();
      await page.locator('#' + item.form + ' [name="' + item.textField + '"]').fill('수정 후 저장된 기록');
      await page.locator('#' + item.form + ' [name="status"]').selectOption(item.kind === 'supports' ? '준비중' : 'published');
      if (item.kind === 'notices') await page.locator('#noticeForm [name="visibility"]').selectOption('public');
      await submit(page, item.form); await reload(page); await tab(page, item.tab);
      row = (await read(coop)).state[item.kind].find(row => row.id === rowId);
      assert.equal(row[item.textField], '수정 후 저장된 기록');
      assert.ok((await page.locator('[data-panel="' + ({ notices: 'notices', meetings: 'meetings', supports: 'supports' }[item.kind]) + '"]').innerText()).includes(title));
      // A distinct disposable record exercises deletion without removing the
      // published record used by member/public readback below.
      await page.locator('#' + item.form + ' [name="title"]').fill(title + ' 삭제용');
      await page.locator('#' + item.form + ' [name="' + item.textField + '"]').fill('삭제할 가상 기록');
      await submit(page, item.form);
      const removable = (await read(coop)).state[item.kind].find(row => row.title === title + ' 삭제용');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('[data-remove="' + item.kind + '"][data-record="' + removable.id + '"]').click();
      await page.waitForFunction(id => !document.querySelector('[data-record="' + id + '"]'), removable.id);
      assert.equal((await read(coop)).state[item.kind].some(row => row.id === removable.id), false);
      proof(coop, item.kind + '-create-edit-reload-delete');
    }

    await tab(page, '계정·권한');
    const emails = await page.locator('#accountsForm [data-key="accountEmail"]').all();
    assert.equal(emails.length, 5);
    await emails[0].fill(index === 0 ? 'chair-jub@example.test' : 'chair-open@example.test');
    await submit(page, 'accountsForm');
    await reload(page); await tab(page, '계정·권한');
    assert.equal(await page.locator('#accountsForm [data-key="accountEmail"]').first().inputValue(), index === 0 ? 'chair-jub@example.test' : 'chair-open@example.test');
    const exported = await download(page, '#export');
    const exportData = JSON.parse(exported.text);
    assert.equal(exportData.workspaceId, coop.workspaceId); assert.equal(exportData.state.profile.purpose, purpose);
    assert.deepEqual(exportData.state, (await read(coop)).state);
    proof(coop, 'existing-account-link-and-current-coop-json-export');

    // A conflicting save must preserve the human's unsaved form values.
    await tab(page, '조합정보');
    await page.locator('#profileForm [name="purpose"]').fill('충돌 시 보존할 입력');
    f.sqlite.prepare('UPDATE cooperative_projects SET revision=revision+1 WHERE workspace_id=?').run(coop.workspaceId);
    await page.locator('#profileForm button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('다른 기기'));
    assert.equal(await page.locator('#profileForm [name="purpose"]').inputValue(), '충돌 시 보존할 입력');
    assert.equal((await read(coop)).state.profile.purpose, purpose);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#reload').click(); await page.waitForFunction(value => document.querySelector('#profileForm [name="purpose"]').value === value, purpose);
    proof(coop, 'concurrent-save-conflict-preserves-input');

    await screenshot(page, coop.slug + '-service-admin-1440');
    assert.equal(JSON.stringify(await read(other)), otherBefore, 'Admin writes must not change the other cooperative');
    proof(coop, 'other-workspace-unchanged-through-all-admin-writes');
    await context.close();

    const memberContext = await contextFor(390, memberToken);
    const member = await memberContext.newPage(); await member.goto(root + '/members');
    await member.waitForSelector('#myBusinessForm');
    for (const title of ['공지', '회의록', '지원사업']) assert.ok((await member.locator('#workspace').innerText()).includes(coop.name + ' ' + title + ' 실증'));
    const memberBusiness = coop.name + ' 조합원 실증 사업체';
    await member.locator('#myBusinessForm [name="business"]').fill(memberBusiness);
    await member.locator('#myBusinessForm [name="industry"]').fill('공동유통');
    await member.locator('#myBusinessForm button[type="submit"]').click();
    await member.waitForFunction(() => document.querySelector('#status').textContent.includes('나의 사업정보가 저장'));
    await reload(member); assert.equal(await member.locator('#myBusinessForm [name="business"]').inputValue(), memberBusiness);
    for (const width of [320, 390]) {
      await member.setViewportSize({ width, height: 844 });
      const lines = await member.getByRole('cell', { name: '공동유통', exact: true }).evaluate(cell => {
        const range = document.createRange(); range.selectNodeContents(cell);
        return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
      });
      assert.equal(lines, 1, 'A Korean industry word must stay intact in the shared member table');
      assert.equal(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    proof(coop, 'mobile-table-preserves-natural-korean-words', { widths: [320, 390] });
    assert.equal((await read(coop)).state.founders[0].business, business);
    assert.ok((await download(member, '#charter')).text.includes(coop.name));
    await screenshot(member, coop.slug + '-service-member-390');
    await member.goto(root + '/admin'); await member.waitForSelector('#gate:not([hidden])');
    assert.equal(await member.locator('#workspace').isVisible(), false);
    await member.goto('https://ekodi.kr/' + other.publicSlug + '/members'); await member.waitForSelector('#gate:not([hidden])');
    assert.equal(await member.locator('#workspace').isVisible(), false);
    proof(coop, 'member-record-readback-self-save-reload-download-and-authority-denials', { width: 390 });
    await member.goto(root + '/members'); await member.waitForSelector('#myBusinessForm');
    await member.locator('#logout').click(); await member.waitForURL(root + '/');
    assert.equal(await member.evaluate(() => sessionStorage.getItem('ekodi-cooperative-auth.v1')), null);
    await member.goto(root + '/members'); await member.waitForSelector('#gate:not([hidden])');
    assert.equal(await member.locator('#workspace').isVisible(), false);
    proof(coop, 'logout-clears-session-and-protected-reentry-denied');
    await memberContext.close();

    const applicantContext = await contextFor(390, 'applicant');
    const applicant = await applicantContext.newPage(); await applicant.goto(root + '/members');
    await applicant.waitForSelector('#application:not([hidden])');
    const grantsBefore = f.sqlite.prepare('SELECT count(*) AS count FROM customer_access_grants').get().count;
    await applicant.locator('#applicationForm [name="representative"]').fill('가상 실증 신청자');
    await applicant.locator('#applicationForm [name="business"]').fill('가상 신청 사업체');
    await applicant.locator('#applicationForm [name="message"]').fill('참여 의사만 접수합니다.');
    await applicant.locator('#applicationForm [name="consent"]').check();
    await applicant.locator('#applicationForm button[type="submit"]').click();
    await applicant.waitForFunction(() => document.querySelector('#applicationResult').textContent.includes('접수되었습니다'));
    const application = f.sqlite.prepare('SELECT person_id,status,business FROM cooperative_applications WHERE workspace_id=? AND email=?').get(coop.workspaceId, 'applicant@example.test');
    assert.ok(application, 'Submitted request must persist under the verified Core identity');
    assert.equal(application.person_id, 'person:applicant@example.test');
    assert.equal(application.status, 'pending'); assert.equal(application.business, '가상 신청 사업체');
    assert.equal(f.sqlite.prepare('SELECT count(*) AS count FROM customer_access_grants').get().count, grantsBefore);
    proof(coop, 'participation-application-stored-without-membership-grant', { width: 390 });
    await applicantContext.close();
    const intakeContext = await contextFor(390, adminToken);
    const intake = await intakeContext.newPage(); await intake.goto(root + '/admin');
    await intake.waitForSelector('#workspace:not([hidden])'); await tab(intake, '계정·권한');
    const intakeText = await intake.locator('[data-panel="accounts"]').innerText();
    assert.ok(intakeText.includes('가상 실증 신청자'));
    assert.ok(intakeText.includes('가상 신청 사업체'));
    assert.ok(intakeText.includes('참여 의사만 접수합니다.'));
    proof(coop, 'administrator-can-read-submitted-participation-request', { width: 390 });
    await intakeContext.close();

    const publicContext = await contextFor(390);
    const publicPage = await publicContext.newPage(); await publicPage.goto(root + '/');
    await publicPage.waitForFunction(value => document.querySelector('#publicPurpose').textContent === value, purpose);
    const publicText = await publicPage.locator('body').innerText();
    assert.ok(publicText.includes(coop.name + ' 공지 실증'));
    assert.equal(publicText.includes(coop.name + ' 회의록 실증'), false);
    assert.equal(publicText.includes('applicant@example.test'), false);
    assert.equal(publicText.includes('초안 대조 완료 · 실증'), false);
    proof(coop, 'public-published-notice-readback-and-private-data-exclusion', { width: 390 });
    await publicContext.close();
  }
}
