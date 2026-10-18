#!/usr/bin/env node
// Read-only EKODI asset inventory report (issue #3805 P1).
// Usage: node scripts/ekodi-asset-inventory.mjs [--check] [--summary]
//   --check    exit 1 only on structural errors (duplicate ids, same-kind path collisions)
//   --summary  print summary + findings only (omit the asset list)
// Never writes files, never calls the network, never changes registries.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildAssetInventory, hasBlockingFindings } from '../ekodi-asset-inventory.js';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^﻿/, ''));

const routes = await import(pathToFileURL(path.join(root, 'platform-route-registry.js')).href);

const report = buildAssetInventory({
  ecosystem: readJson('config/ecosystem-services.json'),
  lifecycle: readJson('config/site-lifecycle-registry.json'),
  boundaries: readJson('platform-boundaries.json'),
  serviceRegistry: readJson('service-registry.json'),
  routeRegistry: routes.PLATFORM_ROUTE_REGISTRY,
  legacyHostPaths: routes.PLATFORM_LEGACY_HOST_PATHS,
  generatedAt: new Date().toISOString(),
});

const args = new Set(process.argv.slice(2));
const output = args.has('--summary') ? { ...report, assets: undefined } : report;
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

if (args.has('--check') && hasBlockingFindings(report)) {
  process.stderr.write('EKODI asset inventory: blocking structural findings present.\n');
  process.exit(1);
}
