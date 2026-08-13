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
      `  --config=<path>   Path to angular.json   (default: ./angular.json)\n` +
      `  --project=<name>  Project in angular.json (default: first project)\n` +
      `  --port=<number>   Proxy port             (default: 4200, or $PROXY_PORT)\n` +
      `  --help            Show this help\n\n` +
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
const port = parseInt(getOpt('port', process.env.PROXY_PORT || '4200'), 10);
if (!Number.isFinite(port) || port <= 0) {
  console.error(`Invalid --port value. Got: ${getOpt('port', '')}`);
  process.exit(1);
}

// Reject the flags the proxy is built on before spawning anything: overriding
// them would silently point the proxy at a server that isn't there.
const reserved = findReservedNgArg(ngArgs);
if (reserved) {
  console.error(
    `"${reserved}" is managed by polyglot and cannot be passed through.\n` +
      `  --port/--host: each ng serve gets a free loopback port the proxy routes to.\n` +
      `  --configuration: derived from the locale you select.\n` +
      `Use polyglot's own --port=<number> for the public proxy port.`,
  );
  process.exit(1);
}

const run =
  command === 'init'
    ? () => init({ configPath, port })
    : command === 'serve'
      ? () => serve({ configPath, projectName, port, ngArgs })
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
