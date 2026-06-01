#!/usr/bin/env node
/**
 * @softwarity/polyglot — serve every locale of an Angular i18n app at once.
 *
 * Usage:
 *   polyglot [--config=./angular.json] [--project=<name>] [--port=4200]
 *   polyglot init [--config=./angular.json] [--port=4200]
 *   polyglot --help
 *
 * Reads angular.json, asks which locales to run (nothing is saved), spawns one
 * `ng serve` per locale, and proxies each under its subPath on a single port.
 * Prebundling is handled automatically (off for multi-locale, on for one).
 */
import path from 'node:path';
import { serve } from '../src/serve.mjs';
import { init } from '../src/init.mjs';

const argv = process.argv.slice(2);

function getOpt(name, fallback) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const hasFlag = (name) => argv.includes(`--${name}`);

if (hasFlag('help') || hasFlag('h')) {
  console.log(
    `@softwarity/polyglot — multi-locale Angular dev proxy\n\n` +
      `Usage:\n` +
      `  polyglot [options]         Start the multi-locale dev proxy\n` +
      `  polyglot init [options]    Add a "start:i18n" script to package.json\n\n` +
      `Options:\n` +
      `  --config=<path>   Path to angular.json   (default: ./angular.json)\n` +
      `  --project=<name>  Project in angular.json (default: first project)\n` +
      `  --port=<number>   Proxy port             (default: 4200, or $PROXY_PORT)\n` +
      `  --help            Show this help\n`,
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

const run =
  command === 'init'
    ? () => init({ configPath, port })
    : command === 'serve'
      ? () => serve({ configPath, projectName, port })
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
