#!/usr/bin/env node
/**
 * @softwarity/polyglot — serve every locale of an Angular i18n app at once.
 *
 * Usage:
 *   polyglot [--config=./angular.json] [--project=<name>] [--port=4200] [-- <ng serve args>]
 *   polyglot init [--config=./angular.json] [--port=4200]
 *   polyglot --help
 *
 * Reads angular.json, asks which locales to run (nothing is saved), spawns one
 * `ng serve` per locale, and proxies each under its subPath on a single port.
 * Prebundling is handled automatically (off for multi-locale, on for one).
 */
import path from 'node:path';
import { serve, findReservedNgArg, RESERVED_NG_FLAGS } from '../src/serve.mjs';
import { init } from '../src/init.mjs';

const rawArgv = process.argv.slice(2);

// Everything after the first "--" belongs to `ng serve`, not to polyglot: the
// options below must only ever see the left-hand side, or a passthrough
// `-- --port=9000` would also be read as the proxy port.
const sep = rawArgv.indexOf('--');
const argv = sep === -1 ? rawArgv : rawArgv.slice(0, sep);
const ngArgs = sep === -1 ? [] : rawArgv.slice(sep + 1);

function getOpt(name, fallback) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => argv.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(
    `@softwarity/polyglot — multi-locale Angular dev proxy\n\n` +
      `Usage:\n` +
      `  polyglot [options] [-- <ng serve args>]   Start the multi-locale dev proxy\n` +
      `  polyglot init [options]                   Add a "start:i18n" script to package.json\n\n` +
      `Options:\n` +
      `  --config=<path>               Path to angular.json    (default: ./angular.json)\n` +
      `  --project=<name>              Project in angular.json (default: first project)\n` +
      `  --port=<number>               Proxy port              (default: 4200, or $PROXY_PORT)\n` +
      `  --locales=<codes>             Locales to run, comma-separated, or "all" — skips the\n` +
      `                                interactive prompt (default: ask)\n` +
      `  --build-configuration=<name>  A configuration from architect.build.configurations,\n` +
      `                                composed with every locale for a variant that cuts\n` +
      `                                across them (a white-label build, a feature flag…):\n` +
      `                                each locale then runs build:<name>,<locale>\n` +
      `  --help                        Show this help\n\n` +
      `Everything after "--" is appended to every "ng serve" command:\n` +
      `  polyglot --port=4200 -- --ssl --poll=2000\n` +
      `Through npm, the first "--" is consumed by npm itself, so pass two:\n` +
      `  npm run start:i18n -- -- --ssl\n` +
      `${RESERVED_NG_FLAGS.join(', ')} are managed by polyglot and rejected there.\n`,
  );
  process.exit(0);
}

const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'serve';

const configPath = path.resolve(process.cwd(), getOpt('config', './angular.json'));
const projectName = getOpt('project', undefined);
const buildConfiguration = getOpt('build-configuration', undefined);
const requestedLocales = getOpt('locales', undefined);

const port = parseInt(getOpt('port', process.env.PROXY_PORT || '4200'), 10);
if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid --port value. Got: ${getOpt('port', '')}`);
  process.exit(1);
}

// Options that don't exist but that fingers reach for anyway. getOpt() ignores an
// unknown option in silence, so without this the run would quietly do something
// else than asked — serve without the variant, or stop on the prompt.
const NEAR_MISSES = [
  {
    match: /^(--configuration|-c)(=|$)/,
    message: (value) =>
      `  A locale's own configuration is derived from your selection, and a shared one is a\n` +
      `  BUILD configuration (architect.build.configurations), not a serve configuration:\n` +
      `    polyglot --port=${port} --build-configuration=${value || '<name>'}`,
  },
  {
    match: /^(--locale|--lang|--language|-lg|-l)(=|$)/,
    message: (value) =>
      `  Locales are selected by code, and several can run at once:\n` +
      `    polyglot --port=${port} --locales=${value || '<code>[,<code>…]'}\n` +
      `    polyglot --port=${port} --locales=all`,
  },
];
for (const { match, message } of NEAR_MISSES) {
  const mistaken = argv.find((a) => match.test(a));
  if (mistaken) {
    console.error(`"${mistaken}" is not a polyglot option.\n${message(mistaken.split('=')[1])}`);
    process.exit(1);
  }
}

// Reject the flags the proxy is built on before spawning anything: overriding
// them would silently point the proxy at a server that isn't there.
const reserved = findReservedNgArg(ngArgs);
if (reserved) {
  const isConfiguration = /^(--configuration|-c)(=|$)/.test(reserved);
  console.error(
    `"${reserved}" is managed by polyglot and cannot be passed through.\n` +
      (isConfiguration
        ? `  Each ng serve already runs --configuration=<locale>, and merging two serve\n` +
          `  configurations keeps only one of them — the shared one or the locale's, never both.\n` +
          `  Use --build-configuration=<name> (before the "--") instead: it composes a BUILD\n` +
          `  configuration into each locale's build target, where options really do merge.\n` +
          `    polyglot --port=${port} --build-configuration=${reserved.split('=')[1] || '<name>'}`
        : `  --port/--host: each ng serve gets a free loopback port the proxy routes to.\n` +
          `  Use polyglot's own --port=<number> for the public proxy port.`),
  );
  process.exit(1);
}

const run =
  command === 'init'
    ? () => init({ configPath, port })
    : command === 'serve'
      ? () => serve({ configPath, projectName, port, ngArgs, buildConfiguration, requestedLocales })
      : null;

if (!run) {
  console.error(`Unknown command "${command}". Try: polyglot --help`);
  process.exit(1);
}

Promise.resolve()
  .then(run)
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
