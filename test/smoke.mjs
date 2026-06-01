#!/usr/bin/env node
/**
 * Minimal smoke test — no framework, just assertions. Runs in CI before publish.
 *
 *  1. `polyglot --help` exits 0 and prints usage.
 *  2. readAngularConfig() correctly derives locales / subPaths / baseHref from a
 *     representative angular.json fixture.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readAngularConfig } from '../src/angular-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// 1. --help
const help = spawnSync('node', [path.join(root, 'bin/polyglot.mjs'), '--help'], {
  encoding: 'utf-8',
});
assert.equal(help.status, 0, '`--help` should exit 0');
assert.match(help.stdout, /multi-locale Angular dev proxy/, '`--help` should print usage');

// 2. config reader against the fixture
const cfg = readAngularConfig({
  configPath: path.join(__dirname, 'fixtures/angular.json'),
});
assert.equal(cfg.projectName, 'fixture-app');
assert.equal(cfg.sourceLocale.code, 'en');
assert.equal(cfg.sourceLocale.subPath, 'en');
assert.equal(cfg.baseHref, '/');
assert.deepEqual(
  cfg.locales.map((l) => `${l.code}:${l.subPath}:${l.hasServeConfig}`),
  ['en:en:true', 'fr:fr:true'],
);
assert.equal(cfg.locales.find((l) => l.isSource)?.code, 'en');

console.log('✓ smoke tests passed');
