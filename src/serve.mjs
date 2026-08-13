import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import readline from 'node:readline';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { readAngularConfig } from './angular-config.mjs';

/** Find a free TCP port chosen by the OS. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** First non-internal IPv4 address, to print a LAN-reachable URL (or null). */
function pickLanIp() {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

/**
 * "fr" → "French, Français": English name then native name via Intl.DisplayNames.
 * Empty string when the code is unknown to ICU.
 */
function localeLabels(code) {
  try {
    const english = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    if (!english || english === code) return '';
    const native = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    const capitalized =
      native && native !== code
        ? native.charAt(0).toLocaleUpperCase(code) + native.slice(1)
        : null;
    return capitalized && capitalized !== english ? `${english}, ${capitalized}` : english;
  } catch {
    return '';
  }
}

/**
 * Ask which locales to run. Nothing is written to disk: the selection lives only
 * for the duration of this process.
 */
function promptLocales(locales) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('\nAvailable locales:');
    locales.forEach((l, i) => {
      const tags = [l.isSource ? 'source' : null, l.hasServeConfig ? null : 'no serve config']
        .filter(Boolean)
        .join(', ');
      const labels = localeLabels(l.code);
      console.log(`  ${i + 1}. ${l.code}${labels ? `, ${labels}` : ''}${tags ? `  (${tags})` : ''}`);
    });
    rl.question(
      '\nWhich locales to run? Comma-separated numbers (e.g. "1,3"), "all" (default), or "q" to quit: ',
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === 'q') process.exit(0);
        if (trimmed === '' || trimmed === 'all') return resolve(locales);
        const indices = trimmed
          .split(',')
          .map((s) => parseInt(s.trim(), 10) - 1)
          .filter((i) => i >= 0 && i < locales.length);
        if (!indices.length) {
          console.error('No valid selection. Exiting.');
          process.exit(1);
        }
        resolve(indices.map((i) => locales[i]));
      },
    );
  });
}

/**
 * Flags polyglot owns: the proxy allocates one free loopback port per locale and
 * derives the configuration from the selection, so letting a passthrough
 * override them would leave the proxy routing to a server that isn't listening
 * there — or serving another locale's translations.
 */
export const RESERVED_NG_FLAGS = ['--port', '--host', '--configuration', '-c'];

/**
 * First passthrough argument that collides with a reserved flag, or null.
 * Matches `--port` and `--port=x`; a bare `--port 4200` is caught by its flag
 * half, which is all we need to refuse the whole invocation.
 */
export function findReservedNgArg(ngArgs = []) {
  return (
    ngArgs.find((arg) =>
      RESERVED_NG_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
    ) || null
  );
}

/**
 * Compose a shared build configuration into a locale's build target:
 * "app:build:fr" + "vatm" → "app:build:vatm,fr".
 *
 * This has to happen on the *build* target, not on `--configuration`. Angular
 * merges a target's configurations left to right, last write wins — and a serve
 * configuration holds nothing but a pointer to a build target, so merging two of
 * them (`--configuration=vatm,fr`) keeps one pointer and silently drops the
 * other: either the locale's translations or the shared configuration's options
 * disappear. Build configurations carry the real options (`localize`,
 * `baseHref`, `fileReplacements`…), so there they genuinely compose.
 *
 * The locale goes last on purpose: it must win every collision, or a shared
 * configuration that sets its own `baseHref` would move the instance out from
 * under the mount the proxy routes to.
 */
export function composeBuildTarget(buildTarget, buildConfiguration) {
  const [project, target, configs] = buildTarget.split(':');
  return `${project}:${target}:${configs ? `${buildConfiguration},${configs}` : buildConfiguration}`;
}

/** "buildTarget" → "--build-target", "browserTarget" → "--browser-target". */
function buildTargetFlag(buildTargetKey) {
  return `--${buildTargetKey.replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)}`;
}

/**
 * Build the `ng serve` argv for one locale.
 *
 * `ngArgs` (everything the caller put after `--`) is appended last: Angular's
 * yargs parser lets the last occurrence win, so a user who passes e.g.
 * `--prebundle` deliberately overrides our default. The flags that would break
 * the proxy never reach here — findReservedNgArg() rejects them at startup.
 *
 * `--configuration=<code>` is only passed when the locale actually declares a
 * serve configuration: Angular hard-fails on an unknown one ("Configuration
 * '<code>' is not set in the workspace"), so passing it blindly guarantees the
 * crash the caller is trying to avoid. Dropping it falls back to the default
 * build, which is only ever the right content for the source locale — callers
 * must not route a translated locale through this path.
 *
 * `--prebundle=false` is forced when more than one locale runs on the Vite
 * dev-server: the concurrent ng serve instances share a single
 * `.angular/cache/.../vite/deps_ssr` directory, and each optimizer keeps bumping
 * the pre-bundle version, invalidating the others' in-flight requests ("There is
 * a new version of the pre-bundle…") until SSR rendering wedges in a permanent
 * re-optimize loop. With a single locale there is no shared mutable cache, so
 * prebundling stays on for a faster start — and the webpack dev-server never
 * gets the flag at all: it has no Vite cache to protect and would exit with
 * "Unknown argument: prebundle".
 */
export function ngServeArgs(
  locale,
  port,
  { prebundle, supportsPrebundle, ngArgs = [], buildTargetArg = null },
) {
  const args = ['ng', 'serve'];
  if (locale.hasServeConfig) args.push(`--configuration=${locale.code}`);
  args.push(
    `--port=${port}`,
    // Private to the proxy: only this script talks to the instances over 127.0.0.1.
    // Binding to loopback (not 0.0.0.0) silences Angular's open-connection warning
    // and avoids host-check / HMR websocket issues.
    '--host=127.0.0.1',
  );
  if (!prebundle && supportsPrebundle) args.push('--prebundle=false');
  // Overrides the pointer the serve configuration above resolves to: a CLI option
  // beats the value coming from a configuration, so the composed target wins.
  if (buildTargetArg) args.push(buildTargetArg);
  return args.concat(ngArgs);
}

/** Spawn one `ng serve` for `locale`, bound to 127.0.0.1 on `port`. */
function spawnNgServe(
  locale,
  port,
  { prebundle, supportsPrebundle, projectRoot, ngArgs, buildTargetArg },
) {
  const args = ngServeArgs(locale, port, { prebundle, supportsPrebundle, ngArgs, buildTargetArg });
  console.log(`▸ Starting ng ${args.slice(1).join(' ')}  [${locale.code}]`);
  // Ignore stdin for children, otherwise every ng serve and this proxy race to
  // read keystrokes (e.g. `q`) and crash with EIO. stdout/stderr are inherited so
  // their logs interleave here. cwd is the project root so ng finds angular.json.
  return spawn('npx', args, {
    cwd: projectRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
}

/**
 * Run the multi-locale dev proxy.
 * @param {{configPath: string, projectName?: string, port: number, ngArgs?: string[],
 *          buildConfiguration?: string}} opts
 */
export async function serve({ configPath, projectName, port, ngArgs = [], buildConfiguration }) {
  const {
    projectName: name,
    projectRoot,
    sourceLocale,
    locales,
    baseHref,
    supportsPrebundle,
    buildTargetKey,
    buildConfigNames,
  } = readAngularConfig({ configPath, projectName });
  console.log(
    `Project: ${name} — source locale: ${sourceLocale.code} — baseHref: ${baseHref}`,
  );

  // Checked before the prompt: no point asking which locales to run when the
  // configuration they'd all be composed with doesn't exist.
  if (buildConfiguration && !buildConfigNames.includes(buildConfiguration)) {
    throw new Error(
      `Unknown build configuration "${buildConfiguration}".\n` +
        `  angular.json declares: ${buildConfigNames.join(', ') || '(none)'}\n` +
        `  --build-configuration takes a name from architect.build.configurations — NOT from\n` +
        `  the serve ones — and composes it with each locale's own build (e.g. "${buildConfiguration},fr").`,
    );
  }
  if (buildConfiguration) {
    console.log(`Shared build configuration: ${buildConfiguration} (composed with each locale)`);
  }

  const selected = await promptLocales(locales);
  console.log(`\nSelected: ${selected.map((l) => l.code).join(', ')}\n`);

  // A translated locale without a serve configuration cannot be started at all:
  // `ng serve --configuration=<code>` dies on the unknown configuration, and the
  // default build carries no translations for it — there is no safe fallback, so
  // it is dropped instead of taking the whole session down with it.
  const orphans = selected.filter((l) => !l.hasServeConfig && !l.isSource);
  if (orphans.length) {
    console.warn(
      `⚠ Skipping ${orphans.map((l) => l.code).join(', ')}: no "serve" configuration in angular.json.\n` +
        `  Add architect.serve.configurations.<code> pointing at a build config with\n` +
        `  baseHref "/${orphans[0].subPath}/" — the default build has no translations for it.\n`,
    );
  }

  const running = selected.filter((l) => l.hasServeConfig || l.isSource);
  if (!running.length) {
    console.error('None of the selected locales can be served. Exiting.');
    process.exit(1);
  }

  // The source locale is the one case where "no serve config" is recoverable:
  // the default build already serves it, untranslated by definition.
  const bare = running.find((l) => !l.hasServeConfig);
  if (bare) {
    console.warn(
      `⚠ No "serve" configuration for the source locale ${bare.code}. Falling back to a plain\n` +
        `  "ng serve" on the default build, mounted at ${bare.baseHref}.\n`,
    );
  }

  // Single locale → keep Vite prebundling; multiple → disable it (see ngServeArgs).
  const prebundle = running.length === 1;

  // Passed through last, so the user's own --prebundle wins over ours. Legal, but
  // it is exactly the setting that wedges concurrent instances — say so.
  if (!prebundle && ngArgs.some((a) => a.startsWith('--prebundle'))) {
    console.warn(
      `⚠ Your "--prebundle" overrides the multi-locale default (off). Concurrent ng serve\n` +
        `  instances share one Vite cache and may loop on "There is a new version of the pre-bundle…".\n`,
    );
  }

  const portMap = new Map();
  for (const locale of running) portMap.set(locale.code, await getFreePort());

  const procs = running.map((locale) =>
    spawnNgServe(locale, portMap.get(locale.code), {
      prebundle,
      supportsPrebundle,
      projectRoot,
      ngArgs,
      buildTargetArg: buildConfiguration
        ? `${buildTargetFlag(buildTargetKey)}=${composeBuildTarget(locale.buildTarget, buildConfiguration)}`
        : null,
    }),
  );

  installCleanup(procs, running);

  const fallback = running.find((l) => l.isSource) || running[0];

  const app = express();
  // Deepest mount first: a locale sitting at "/" — or at a prefix of another
  // one's baseHref — would otherwise swallow its siblings' requests.
  const mounts = [...running].sort((a, b) => b.baseHref.length - a.baseHref.length);
  for (const locale of mounts) {
    // Each locale carries its own resolved baseHref ("/app/fr/"); Express wants it
    // without the trailing slash ("/app/fr"), and "/" at the domain root.
    const mountPath = locale.baseHref.replace(/\/+$/, '') || '/';
    app.use(
      mountPath,
      createProxyMiddleware({
        target: `http://localhost:${portMap.get(locale.code)}`,
        changeOrigin: true,
        ws: true,
        // Express strips `mountPath` from req.url before the middleware runs. The
        // ng serve instance is configured with the full baseHref, so hitting "/"
        // would 301 back to its own baseHref → redirect loop. Re-inject the
        // original URL so the instance receives the full path it expects.
        pathRewrite: (_p, req) => req.originalUrl,
      }),
    );
  }
  // Anything else → send the visitor to the fallback locale's own baseHref.
  app.use((_req, res) => res.redirect(302, fallback.baseHref));

  // Listen on every interface (like `ng serve --host=0.0.0.0`) so the proxy is
  // reachable from the LAN, but print readable URLs (localhost + first LAN IP).
  app.listen(port, '0.0.0.0', () => {
    const lanIp = pickLanIp();
    console.log('\n──────────────────────────────────────────────');
    console.log(`▸ Proxy listening on 0.0.0.0:${port} — open one of:`);
    console.log(`    Local:   http://localhost:${port}${baseHref}`);
    if (lanIp) console.log(`    Network: http://${lanIp}:${port}${baseHref}`);
    running.forEach((l) => {
      console.log(
        `    ${l.code.padEnd(8)} → http://localhost:${port}${l.baseHref}  (ng serve :${portMap.get(l.code)})`,
      );
    });
    console.log(`▸ Fallback locale: ${fallback.code}`);
    console.log(
      `▸ Vite prebundling: ${
        !supportsPrebundle
          ? 'n/a (webpack dev-server, no shared Vite cache)'
          : prebundle
            ? 'on (single locale)'
            : 'off (multi-locale)'
      }`,
    );
    console.log('──────────────────────────────────────────────\n');
  });
}

/**
 * Tear down every ng serve child on exit, signals, crashes, or if any instance
 * dies on its own (so we never leave a proxy pointing at dead instances, nor
 * orphan ng serve processes).
 */
function installCleanup(procs, running) {
  let cleaningUp = false;
  const cleanup = (signal) => {
    if (cleaningUp) return;
    cleaningUp = true;
    console.log(`\nShutting down ng serve instances (${signal})…`);
    for (const p of procs) {
      if (p.exitCode === null && !p.killed) p.kill('SIGTERM');
    }
    setTimeout(() => {
      for (const p of procs) {
        if (p.exitCode === null && !p.killed) p.kill('SIGKILL');
      }
      process.exit(0);
    }, 3000).unref();
  };

  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  process.on('exit', () => {
    // Last chance — synchronous, can't wait for SIGTERM to be honoured.
    for (const p of procs) {
      if (p.exitCode === null && !p.killed) p.kill('SIGKILL');
    }
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup('uncaughtException');
  });

  procs.forEach((p, i) => {
    p.on('exit', (code, signal) => {
      if (!cleaningUp) {
        console.error(`ng serve [${running[i].code}] exited (code=${code}, signal=${signal})`);
        cleanup('child-exit');
      }
    });
  });
}
