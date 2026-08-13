#!/usr/bin/env node
/**
 * Minimal smoke test — no framework, just assertions. Runs in CI before publish.
 *
 *  1. `polyglot --help` exits 0 and prints usage.
 *  2. readAngularConfig() correctly derives locales / subPaths / baseHref from a
 *     representative angular.json fixture.
 *  3. Same, for a project whose source locale has no dedicated config and whose
 *     default baseHref is already scoped to it ("/app/en/").
 *  4. ngServeArgs() only passes flags the target ng serve actually accepts.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readAngularConfig } from '../src/angular-config.mjs';
import { ngServeArgs } from '../src/serve.mjs';

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
// Per-locale baseHref comes from each build configuration.
assert.deepEqual(
  cfg.locales.map((l) => l.baseHref),
  ['/en/', '/fr/'],
);
assert.equal(cfg.supportsPrebundle, true, 'application builder accepts --prebundle');

// 3. source locale with no dedicated config, default baseHref already scoped to it
const scoped = readAngularConfig({
  configPath: path.join(__dirname, 'fixtures/source-scoped-basehref.json'),
});
// "/flight-folder-frontend/en/" is the source locale's own baseHref, not a root to
// append subPaths to — the shared root is what's left once "en/" is peeled off.
assert.equal(scoped.baseHref, '/flight-folder-frontend/');
const byCode = Object.fromEntries(scoped.locales.map((l) => [l.code, l]));
assert.equal(byCode.en.baseHref, '/flight-folder-frontend/en/', 'no en/en double mount');
assert.equal(byCode.en.hasServeConfig, false);
assert.equal(byCode.en.isSource, true);
// fr/lo declare their own build baseHref — used verbatim, never re-prefixed.
assert.equal(byCode.fr.baseHref, '/flight-folder-frontend/fr/');
assert.equal(byCode.lo.baseHref, '/flight-folder-frontend/lo/');
// ru has no build config at all → derived from the shared root, not from "/…/en/".
assert.equal(byCode.ru.baseHref, '/flight-folder-frontend/ru/');
assert.equal(byCode.ru.hasServeConfig, false);
assert.equal(scoped.supportsPrebundle, false, 'webpack builder rejects --prebundle');

// 4. ng serve argv
const withConfig = { code: 'fr', hasServeConfig: true };
const sourceNoConfig = { code: 'en', hasServeConfig: false, isSource: true };
assert.deepEqual(ngServeArgs(withConfig, 4301, { prebundle: false, supportsPrebundle: true }), [
  'ng',
  'serve',
  '--configuration=fr',
  '--port=4301',
  '--host=127.0.0.1',
  '--prebundle=false',
]);
// No serve config → no --configuration flag: Angular fails on an unknown one.
assert.deepEqual(ngServeArgs(sourceNoConfig, 4302, { prebundle: true, supportsPrebundle: true }), [
  'ng',
  'serve',
  '--port=4302',
  '--host=127.0.0.1',
]);
// webpack dev-server → never --prebundle, even with several locales running.
assert.deepEqual(ngServeArgs(withConfig, 4303, { prebundle: false, supportsPrebundle: false }), [
  'ng',
  'serve',
  '--configuration=fr',
  '--port=4303',
  '--host=127.0.0.1',
]);

console.log('✓ smoke tests passed');
