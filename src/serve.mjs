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
      console.log(`  ${i + 1}. ${l.code}${tags ? `  (${tags})` : ''}`);
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
 * Spawn one `ng serve --configuration=<code>` bound to 127.0.0.1 on `port`.
 *
 * `prebundle=false` is forced when more than one locale runs: the concurrent
 * ng serve instances share a single `.angular/cache/.../vite/deps_ssr` directory,
 * and each optimizer keeps bumping the pre-bundle version, invalidating the
 * others' in-flight requests ("There is a new version of the pre-bundle…") until
 * SSR rendering wedges in a permanent re-optimize loop. With a single locale
 * there is no shared mutable cache, so prebundling stays on for a faster start.
 */
function spawnNgServe(locale, port, { prebundle, projectRoot }) {
  console.log(`▸ Starting ng serve --configuration=${locale.code} on port ${port}…`);
  const args = [
    'ng',
    'serve',
    `--configuration=${locale.code}`,
    `--port=${port}`,
    // Private to the proxy: only this script talks to the instances over 127.0.0.1.
    // Binding to loopback (not 0.0.0.0) silences Angular's open-connection warning
    // and avoids host-check / HMR websocket issues.
    '--host=127.0.0.1',
  ];
  if (!prebundle) args.push('--prebundle=false');
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
 * @param {{configPath: string, projectName?: string, port: number}} opts
 */
export async function serve({ configPath, projectName, port }) {
  const { projectName: name, projectRoot, sourceLocale, locales, baseHref } = readAngularConfig({
    configPath,
    projectName,
  });
  console.log(
    `Project: ${name} — source locale: ${sourceLocale.code} — baseHref: ${baseHref}`,
  );

  const selected = await promptLocales(locales);
  console.log(`\nSelected: ${selected.map((l) => l.code).join(', ')}\n`);

  const missing = selected.filter((l) => !l.hasServeConfig);
  if (missing.length) {
    console.warn(
      `⚠ No "serve" configuration in angular.json for: ${missing.map((l) => l.code).join(', ')}.\n` +
        `  Each locale needs architect.serve.configurations.<code> pointing at a build\n` +
        `  config with the right baseHref (e.g. "/${missing[0].code}/"). Starting anyway…\n`,
    );
  }

  // Single locale → keep Vite prebundling; multiple → disable it (see spawnNgServe).
  const prebundle = selected.length === 1;

  const portMap = new Map();
  for (const locale of selected) portMap.set(locale.code, await getFreePort());

  const procs = selected.map((locale) =>
    spawnNgServe(locale, portMap.get(locale.code), { prebundle, projectRoot }),
  );

  installCleanup(procs, selected);

  const fallback = selected.find((l) => l.isSource) || selected[0];

  const app = express();
  for (const locale of selected) {
    // baseHref ends with '/', so `${baseHref}${subPath}` is e.g. "/fr".
    const mountPath = `${baseHref}${locale.subPath}`;
    app.use(
      mountPath,
      createProxyMiddleware({
        target: `http://localhost:${portMap.get(locale.code)}`,
        changeOrigin: true,
        ws: true,
        // Express strips `mountPath` from req.url before the middleware runs. The
        // the ng serve instance is configured with the full baseHref, so hitting "/"
        // would 301 back to "<baseHref><subPath>/" → redirect loop. Re-inject the
        // original URL so the instance receives the full path it expects.
        pathRewrite: (_p, req) => req.originalUrl,
      }),
    );
  }
  // Anything else → send the visitor to the fallback locale under baseHref.
  app.use((_req, res) => res.redirect(302, `${baseHref}${fallback.subPath}/`));

  // Listen on every interface (like `ng serve --host=0.0.0.0`) so the proxy is
  // reachable from the LAN, but print readable URLs (localhost + first LAN IP).
  app.listen(port, '0.0.0.0', () => {
    const lanIp = pickLanIp();
    console.log('\n──────────────────────────────────────────────');
    console.log(`▸ Proxy listening on 0.0.0.0:${port} — open one of:`);
    console.log(`    Local:   http://localhost:${port}${baseHref}`);
    if (lanIp) console.log(`    Network: http://${lanIp}:${port}${baseHref}`);
    selected.forEach((l) => {
      console.log(
        `    ${l.code.padEnd(8)} → http://localhost:${port}${baseHref}${l.subPath}/  (ng serve :${portMap.get(l.code)})`,
      );
    });
    console.log(`▸ Fallback locale: ${fallback.code}`);
    console.log(`▸ Vite prebundling: ${prebundle ? 'on (single locale)' : 'off (multi-locale)'}`);
    console.log('──────────────────────────────────────────────\n');
  });
}

/**
 * Tear down every ng serve child on exit, signals, crashes, or if any instance
 * dies on its own (so we never leave a proxy pointing at dead instances, nor
 * orphan ng serve processes).
 */
function installCleanup(procs, selected) {
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
        console.error(`ng serve [${selected[i].code}] exited (code=${code}, signal=${signal})`);
        cleanup('child-exit');
      }
    });
  });
}
