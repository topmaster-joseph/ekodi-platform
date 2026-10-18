import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  buildAssetInventory,
  classifyServiceUrlDifference,
  hasBlockingFindings,
  ASSET_STATUS_UNKNOWN,
} from '../ekodi-asset-inventory.js';
import { PLATFORM_ROUTE_REGISTRY, PLATFORM_LEGACY_HOST_PATHS, platformHost } from '../platform-route-registry.js';

const SOURCES = ['config/ecosystem-services.json', 'config/site-lifecycle-registry.json', 'platform-boundaries.json', 'service-registry.json', 'platform-route-registry.js'];
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const hashAll = () => SOURCES.map((file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')).join(',');

function realInputs() {
  return {
    ecosystem: readJson('config/ecosystem-services.json'),
    lifecycle: readJson('config/site-lifecycle-registry.json'),
    boundaries: readJson('platform-boundaries.json'),
    serviceRegistry: readJson('service-registry.json'),
    routeRegistry: PLATFORM_ROUTE_REGISTRY,
    legacyHostPaths: PLATFORM_LEGACY_HOST_PATHS,
  };
}

test('projects every authoritative registry without changing source counts', () => {
  const inputs = realInputs();
  const report = buildAssetInventory(inputs);
  assert.equal(report.mode, 'read-only');
  assert.equal(report.summary.byKind.service, inputs.ecosystem.services.length);
  assert.equal(report.summary.byKind.site, inputs.lifecycle.existingWorkspaceSites.length);
  assert.equal(report.summary.byKind.module, Object.keys(inputs.boundaries.platforms).length);
  assert.equal(report.summary.byKind.core, PLATFORM_ROUTE_REGISTRY.canonical.length);
  for (const item of report.assets) {
    for (const key of ['assetId', 'kind', 'ownerBoundary', 'canonicalPath', 'runtimeAlias', 'lifecycle', 'dataBoundary', 'dependencyIds', 'healthProbe', 'status', 'observedAt', 'evidenceRef']) {
      assert.ok(key in item, `${item.assetId} missing ${key}`);
    }
  }
});

test('never reports health without evidence: every asset is UNKNOWN', () => {
  const report = buildAssetInventory(realInputs());
  assert.ok(report.assets.every((item) => item.status === ASSET_STATUS_UNKNOWN && item.observedAt === null));
  assert.deepEqual(Object.keys(report.summary.byStatus), [ASSET_STATUS_UNKNOWN]);
});

test('detects the six service-registry URL differences as non-mutating findings', () => {
  const before = hashAll();
  const inputs = realInputs();
  const snapshot = JSON.stringify(inputs.serviceRegistry);
  const report = buildAssetInventory(inputs);
  const diffs = report.findings.filter((item) => item.subject.startsWith('service:') && item.code !== 'not_in_public_catalog');
  assert.deepEqual(diffs.map((item) => item.subject).sort(), ['service:biz', 'service:books', 'service:church', 'service:lab', 'service:publishing', 'service:trade']);
  assert.equal(report.summary.serviceRegistryUrlDifferences, 6);
  assert.ok(report.findings.every((item) => item.mutation === 'none'));
  assert.equal(JSON.stringify(inputs.serviceRegistry), snapshot, 'input object must not be mutated');
  assert.equal(hashAll(), before, 'source files must not change');
});

test('distinguishes legacy alias, alias-target mismatch, private boundary and unmapped difference', () => {
  // Fixture hosts are built with the registry's own helper (legacy-alias fixtures, not new references).
  const legacyHostPaths = { [platformHost('biz')]: '/ekodibiz', [platformHost('trade')]: '/trade' };
  const url = (label) => `https://${platformHost(label)}`;
  assert.equal(classifyServiceUrlDifference({ registryHref: url('biz'), ecosystemService: { url: 'https://ekodi.kr/ekodibiz' }, legacyHostPaths }).code, 'legacy_alias_resolves_to_canonical');
  assert.equal(classifyServiceUrlDifference({ registryHref: url('trade'), ecosystemService: { url: 'https://ekodi.kr/ekodibiz/trade' }, legacyHostPaths }).code, 'legacy_alias_target_mismatch');
  assert.equal(classifyServiceUrlDifference({ registryHref: url('admin'), ecosystemService: undefined, legacyHostPaths }).code, 'not_in_public_catalog');
  assert.equal(classifyServiceUrlDifference({ registryHref: url('x'), ecosystemService: { url: 'https://ekodi.kr/x' }, legacyHostPaths }).code, 'unmapped_url_difference');
  assert.equal(classifyServiceUrlDifference({ registryHref: 'https://ekodi.kr/ekodimall/', ecosystemService: { url: 'https://ekodi.kr/ekodimall' }, legacyHostPaths }).code, 'consistent');
  // A legitimate subdomain canonical (catalog itself uses it) is not a difference.
  assert.equal(classifyServiceUrlDifference({ registryHref: url('edu'), ecosystemService: { url: url('edu') }, legacyHostPaths }).code, 'consistent');
});

test('admin stays out of the public catalog; preparing/beta/planned are never public', () => {
  const report = buildAssetInventory(realInputs());
  assert.ok(!report.assets.some((item) => item.assetId === 'service:admin'));
  const nonLive = report.assets.filter((item) => item.kind === 'service' && item.lifecycle !== 'live');
  assert.ok(nonLive.length > 0);
  assert.ok(nonLive.every((item) => item.visibility === 'non-public'));
});

test('duplicate asset id and same-kind path collision are blocking; cross-kind sharing is informational', () => {
  const report = buildAssetInventory({
    ecosystem: { services: [
      { id: 'a', url: 'https://ekodi.kr/a', status: 'live', productionVerified: true },
      { id: 'a', url: 'https://ekodi.kr/a2', status: 'live', productionVerified: true },
      { id: 'b', url: 'https://ekodi.kr/a2', status: 'beta' },
    ] },
    lifecycle: { existingWorkspaceSites: [{ id: 's', class: 'workspace_user_site', canonicalUrl: 'https://ekodi.kr/a', workspaceId: 'secret-ws' }] },
  });
  const codes = report.findings.map((item) => item.code);
  assert.ok(codes.includes('duplicate_asset_id'));
  assert.ok(codes.includes('canonical_path_collision'));
  assert.ok(codes.includes('shared_canonical_path'));
  assert.equal(hasBlockingFindings(report), true);
  assert.ok(!JSON.stringify(report).includes('secret-ws'), 'workspace identity must not be projected');
});

test('real registries have no blocking structural findings and report is immutable', () => {
  const report = buildAssetInventory(realInputs());
  assert.equal(hasBlockingFindings(report), false);
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.assets[0]));
  assert.throws(() => { 'use strict'; report.assets[0].status = 'healthy'; }, TypeError);
});

test('empty or missing registries fail closed to an empty unknown inventory', () => {
  const report = buildAssetInventory();
  assert.equal(report.summary.assets, 0);
  assert.equal(hasBlockingFindings(report), false);
});

test('CLI is read-only and --check passes on current registries', () => {
  const before = hashAll();
  const out = execFileSync(process.execPath, ['scripts/ekodi-asset-inventory.mjs', '--check', '--summary'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.mode, 'read-only');
  assert.equal(parsed.assets, undefined);
  assert.equal(parsed.summary.serviceRegistryUrlDifferences, 6);
  assert.equal(hashAll(), before);
});
