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
 *  5. Passthrough args (after "--") reach ng serve, and reserved ones are refused.
 *  6. --configuration composes into each locale's build target, not into --configuration.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readAngularConfig } from '../src/angular-config.mjs';
import { ngServeArgs, findReservedNgArg, composeBuildTarget } from '../src/serve.mjs';

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

// 5. passthrough args
// Appended last so Angular's yargs lets a deliberate user flag win over ours.
assert.deepEqual(
  ngServeArgs(withConfig, 4304, {
    prebundle: false,
    supportsPrebundle: true,
    ngArgs: ['--ssl', '--poll=2000'],
  }),
  [
    'ng',
    'serve',
    '--configuration=fr',
    '--port=4304',
    '--host=127.0.0.1',
    '--prebundle=false',
    '--ssl',
    '--poll=2000',
  ],
);
// Flags the proxy is built on are refused, in both long and short form.
assert.equal(findReservedNgArg(['--ssl', '--port=9000']), '--port=9000');
assert.equal(findReservedNgArg(['--host', '0.0.0.0']), '--host');
assert.equal(findReservedNgArg(['-c', 'de']), '-c');
assert.equal(findReservedNgArg(['--configuration=de']), '--configuration=de');
assert.equal(findReservedNgArg(['--ssl', '--poll=2000']), null);
// Not a prefix match: unrelated flags that merely start the same must pass.
assert.equal(findReservedNgArg(['--port-range=1', '--hostname=x']), null);
assert.equal(findReservedNgArg([]), null);

// The "--" separator splits polyglot's own options from the passthrough: a
// passthrough --port must not be read as the proxy port (it must be refused).
const clash = spawnSync(
  'node',
  [path.join(root, 'bin/polyglot.mjs'), '--port=4200', '--', '--port=9000'],
  { encoding: 'utf-8' },
);
assert.equal(clash.status, 1, 'a reserved passthrough flag should exit 1');
assert.match(clash.stderr, /managed by polyglot/);
// Options after "--" belong to ng serve, so --help there is not polyglot's help.
const helpAfterSep = spawnSync('node', [path.join(root, 'bin/polyglot.mjs'), '--help'], {
  encoding: 'utf-8',
});
assert.match(helpAfterSep.stdout, /Everything after "--" is appended/, 'help documents passthrough');

// 6. shared build configuration
// Angular ≥ 17 workspaces point at their build with "buildTarget"…
assert.equal(cfg.buildTargetKey, 'buildTarget');
assert.deepEqual(cfg.buildConfigNames, ['en', 'fr']);
assert.equal(
  cfg.locales.find((l) => l.code === 'fr').buildTarget,
  'fixture-app:build:development,fr',
);
// …pre-17 ones with "browserTarget".
assert.equal(scoped.buildTargetKey, 'browserTarget');
assert.equal(byCode.fr.buildTarget, 'flight-folder-frontend:build:fr');
// A locale with no serve configuration falls back to the plain build target.
assert.equal(byCode.en.buildTarget, 'flight-folder-frontend:build');

// The shared configuration goes FIRST so the locale keeps winning collisions
// (its baseHref is what the proxy mounts).
assert.equal(composeBuildTarget('app:build:fr', 'vatm'), 'app:build:vatm,fr');
assert.equal(
  composeBuildTarget('fixture-app:build:development,fr', 'vatm'),
  'fixture-app:build:vatm,development,fr',
);
// No configuration yet on the target (source locale on the default build).
assert.equal(composeBuildTarget('app:build', 'vatm'), 'app:build:vatm');

// It reaches ng serve as a build-target override, never as a second --configuration:
// merging two serve configurations would keep one pointer and drop the other.
const composed = ngServeArgs(withConfig, 4305, {
  prebundle: false,
  supportsPrebundle: false,
  buildTargetArg: '--browser-target=app:build:vatm,fr',
});
assert.deepEqual(composed, [
  'ng',
  'serve',
  '--configuration=fr',
  '--port=4305',
  '--host=127.0.0.1',
  '--browser-target=app:build:vatm,fr',
]);
assert.equal(composed.filter((a) => a.startsWith('--configuration')).length, 1);

// An unknown configuration fails before the locale prompt, listing what exists.
const unknown = spawnSync(
  'node',
  [
    path.join(root, 'bin/polyglot.mjs'),
    `--config=${path.join(__dirname, 'fixtures/angular.json')}`,
    '--build-configuration=nope',
  ],
  { encoding: 'utf-8', input: 'q\n' },
);
assert.equal(unknown.status, 1, 'unknown configuration should exit 1');
assert.match(unknown.stderr, /Unknown build configuration "nope"/);
assert.match(unknown.stderr, /angular\.json declares: en, fr/);

// The flag names a BUILD configuration, so --configuration must not be silently
// ignored on either side of the "--" — both point at the flag that exists.
const misplaced = spawnSync(
  'node',
  [path.join(root, 'bin/polyglot.mjs'), '--', '--configuration=vatm'],
  { encoding: 'utf-8' },
);
assert.equal(misplaced.status, 1);
assert.match(misplaced.stderr, /polyglot --port=4200 --build-configuration=vatm/);

const wrongName = spawnSync('node', [path.join(root, 'bin/polyglot.mjs'), '--configuration=vatm'], {
  encoding: 'utf-8',
});
assert.equal(wrongName.status, 1, 'a silently ignored --configuration would serve without it');
assert.match(wrongName.stderr, /not a polyglot option/);
assert.match(wrongName.stderr, /polyglot --port=4200 --build-configuration=vatm/);
assert.equal(
  spawnSync('node', [path.join(root, 'bin/polyglot.mjs'), '-c', 'vatm'], { encoding: 'utf-8' })
    .status,
  1,
  'the short form is caught too',
);

console.log('✓ smoke tests passed');
