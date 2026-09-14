import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInstitution, institutionCoverageStatus, verifiedInstitutionOpportunities } from '../support/institution-sources.js';

test('trusted institution registry classifies only registered public-interest institutions', () => {
  assert.equal(classifyInstitution('\uC18C\uC0C1\uACF5\uC778\uC2DC\uC7A5\uC9C4\uD765\uACF5\uB2E8')?.classId, 'quasi_government');
  assert.equal(classifyInstitution('\uD55C\uAD6D\uC804\uC790\uD1B5\uC2E0\uC5F0\uAD6C\uC6D0')?.classId, 'government_funded_research');
  assert.equal(classifyInstitution('private-profit-company'), null);
});

test('institution coverage includes quasi-public and government-funded source classes', () => {
  const source = institutionCoverageStatus()[0];
  assert.equal(source.mode, 'verified_registry');
  assert.equal(source.ingestion, true);
  assert.ok(source.coverageClasses.includes('quasi_government'));
  assert.ok(source.coverageClasses.includes('government_funded_research'));
  assert.ok(source.coverageClasses.includes('university_public_startup_support'));
});

test('2026 second Modoo Startup notice is active through its official application window', () => {
  const items = verifiedInstitutionOpportunities({ now: '2026-09-12T08:00:00+09:00' });
  const notice = items.find(item => item.id === 'mss-modoo-startup-2026-round2');
  assert.ok(notice); assert.equal(notice.official, true); assert.equal(notice.institutionClass, 'central_government'); assert.equal(notice.applicationUrl, 'https://www.modoo.or.kr'); assert.match(notice.applicationPeriod, /2026-09-17/);
  const expired = verifiedInstitutionOpportunities({ now: '2026-09-18T00:00:00+09:00' });
  assert.equal(expired.some(item => item.id === 'mss-modoo-startup-2026-round2'), false);
});
