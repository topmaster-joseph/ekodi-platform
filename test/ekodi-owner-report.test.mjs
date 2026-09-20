import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEkodiOwnerReport } from '../ekodi-owner-report.js';

const healthyOverview = {
  services: [
    { id:'root', name:'EKODI Root', state:'active', monitorEnabled:true, latest:{ status:'online', responseTime:120 } },
    { id:'admin', name:'EKODI Admin', state:'active', monitorEnabled:true, latest:{ status:'online', responseTime:150 } },
  ],
};

test('routine healthy state is suppressed and explicitly owned by EKODI', () => {
  const report = buildEkodiOwnerReport({ overview:healthyOverview, evolution:{ recommendations:[] }, generatedAt:'2026-09-20T07:00:00Z' });
  assert.equal(report.reportAuthor, 'EKODI Orchestrator');
  assert.equal(report.chatgptTriggerRequired, false);
  assert.equal(report.category, 'operating-well');
  assert.equal(report.shouldPersist, false);
});

test('new service failure becomes a concise EKODI attention report without inventing owner action', () => {
  const report = buildEkodiOwnerReport({
    overview:{ services:[{ id:'root', name:'EKODI Root', state:'active', monitorEnabled:true, latest:{ status:'offline', responseTime:8000 } }] },
    evolution:{ recommendations:[] },
    generatedAt:'2026-09-20T07:10:00Z',
  });
  assert.equal(report.category, 'attention-required');
  assert.equal(report.decisionRequired, false);
  assert.equal(report.shouldPersist, true);
  assert.match(report.summary, /자동 진단·복구/);
  assert.match(report.requiredAction, /현재 대표 조치 없음/);
});

test('approval-gated evolution becomes an owner decision report', () => {
  const report = buildEkodiOwnerReport({
    overview:healthyOverview,
    evolution:{ recommendations:[{ id:'paid-provider', title:'유료 공급자 활성화', publishable:true, approval:{ required:true }, score:98, confidence:96 }] },
    generatedAt:'2026-09-20T07:20:00Z',
  });
  assert.equal(report.category, 'owner-decision-required');
  assert.equal(report.decisionRequired, true);
  assert.equal(report.importance, 'critical');
  assert.equal(report.shouldPersist, true);
});

test('same material state is not reported repeatedly', () => {
  const first = buildEkodiOwnerReport({
    overview:{ services:[{ id:'root', name:'EKODI Root', state:'active', monitorEnabled:true, latest:{ status:'offline' } }] },
    evolution:{ recommendations:[] },
    generatedAt:'2026-09-20T07:30:00Z',
  });
  const second = buildEkodiOwnerReport({
    overview:{ services:[{ id:'root', name:'EKODI Root', state:'active', monitorEnabled:true, latest:{ status:'offline' } }] },
    evolution:{ recommendations:[] },
    previous:first,
    generatedAt:'2026-09-20T07:40:00Z',
  });
  assert.equal(second.duplicateOfPrevious, true);
  assert.equal(second.shouldPersist, false);
});

test('verified recovery after a material incident produces one short completion report', () => {
  const previous = buildEkodiOwnerReport({
    overview:{ services:[{ id:'root', name:'EKODI Root', state:'active', monitorEnabled:true, latest:{ status:'offline' } }] },
    evolution:{ recommendations:[] },
    generatedAt:'2026-09-20T07:50:00Z',
  });
  const recovered = buildEkodiOwnerReport({
    overview:healthyOverview,
    evolution:{ recommendations:[] },
    previous,
    generatedAt:'2026-09-20T08:00:00Z',
  });
  assert.equal(recovered.category, 'verified-completion');
  assert.equal(recovered.shouldPersist, true);
  assert.match(recovered.title, /복구/);
});
