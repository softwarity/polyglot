import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Add a ready-to-run npm script to the host project's package.json.
 *
 * The written command spells out the default options (`--config`, `--port`) so
 * the dev sees them and can tweak them in place. We never overwrite an existing
 * script of the same name — we leave it and report it.
 *
 * @param {object} opts
 * @param {string} opts.configPath   Path to angular.json, as passed on the CLI.
 * @param {number} opts.port         Default proxy port to write into the script.
 * @param {string} [opts.scriptName] Script key to create. Default "start:i18n".
 */
export function init({ configPath, port, scriptName = 'start:i18n' }) {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read package.json at ${pkgPath}: ${err.message}`);
  }

  // Keep the path relative and tidy for the written command.
  const rel = path.relative(process.cwd(), configPath) || 'angular.json';
  const command = `polyglot --config=./${rel} --port=${port}`;

  pkg.scripts ||= {};
  const existing = pkg.scripts[scriptName];
  if (existing) {
    if (existing === command) {
      console.log(`✓ "${scriptName}" already set to:\n    ${command}`);
    } else {
      console.log(
        `⚠ "${scriptName}" already exists — leaving it untouched:\n    ${existing}\n` +
          `  To use polyglot's default, set it to:\n    ${command}`,
      );
    }
    return;
  }

  pkg.scripts[scriptName] = command;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Added "${scriptName}" to package.json:\n    ${command}`);
  console.log(`\n  Run it with:  npm run ${scriptName}`);
}
