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
 *  6. --build-configuration composes into each locale's build target.
 *  7. --locales picks the locales without the prompt.
 *  8. --ssl-cert / --ssl-key: both or neither, readable, checked before anything starts.
 *  9. The proxy server itself, in HTTPS: a request and a WebSocket upgrade make the
 *     round trip to a dummy HTTP child (no ng serve), routed to the right locale.
 */
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readAngularConfig } from '../src/angular-config.mjs';
import {
  ngServeArgs,
  findReservedNgArg,
  composeBuildTarget,
  selectLocales,
  readTlsOptions,
  createProxyApp,
  listen,
} from '../src/serve.mjs';

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
  '--ssl=false',
  '--prebundle=false',
]);
// No serve config → no --configuration flag: Angular fails on an unknown one.
assert.deepEqual(ngServeArgs(sourceNoConfig, 4302, { prebundle: true, supportsPrebundle: true }), [
  'ng',
  'serve',
  '--port=4302',
  '--host=127.0.0.1',
  '--ssl=false',
]);
// webpack dev-server → never --prebundle, even with several locales running.
assert.deepEqual(ngServeArgs(withConfig, 4303, { prebundle: false, supportsPrebundle: false }), [
  'ng',
  'serve',
  '--configuration=fr',
  '--port=4303',
  '--host=127.0.0.1',
  '--ssl=false',
]);

// 5. passthrough args
// Appended last so Angular's yargs lets a deliberate user flag win over ours.
assert.deepEqual(
  ngServeArgs(withConfig, 4304, {
    prebundle: false,
    supportsPrebundle: true,
    ngArgs: ['--poll=2000', '--verbose'],
  }),
  [
    'ng',
    'serve',
    '--configuration=fr',
    '--port=4304',
    '--host=127.0.0.1',
    '--ssl=false',
    '--prebundle=false',
    '--poll=2000',
    '--verbose',
  ],
);
// Flags the proxy is built on are refused, in both long and short form.
assert.equal(findReservedNgArg(['--poll=2000', '--port=9000']), '--port=9000');
assert.equal(findReservedNgArg(['--host', '0.0.0.0']), '--host');
assert.equal(findReservedNgArg(['-c', 'de']), '-c');
assert.equal(findReservedNgArg(['--configuration=de']), '--configuration=de');
assert.equal(findReservedNgArg(['--poll=2000', '--verbose']), null);
// TLS belongs to the proxy: an instance serving HTTPS behind an http:// target
// would fail every request.
assert.equal(findReservedNgArg(['--poll=2000', '--ssl']), '--ssl');
assert.equal(findReservedNgArg(['--ssl=true']), '--ssl=true');
assert.equal(findReservedNgArg(['--ssl-cert=x']), '--ssl-cert=x');
assert.equal(findReservedNgArg(['--ssl-key=x']), '--ssl-key=x');
assert.equal(findReservedNgArg(['--ssl-key', 'x']), '--ssl-key');
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
  '--ssl=false',
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

// 7. non-interactive locale selection
const declared = [
  { code: 'en', isSource: true },
  { code: 'fr' },
  { code: 'pt-BR' },
];
assert.deepEqual(selectLocales(declared, 'all').map((l) => l.code), ['en', 'fr', 'pt-BR']);
assert.deepEqual(selectLocales(declared, 'ALL').map((l) => l.code), ['en', 'fr', 'pt-BR']);
assert.deepEqual(selectLocales(declared, 'fr').map((l) => l.code), ['fr']);
// Order follows the request, spacing is forgiven.
assert.deepEqual(selectLocales(declared, 'fr, en').map((l) => l.code), ['fr', 'en']);
// Angular declares "pt-BR"; typing the capitals is not required.
assert.deepEqual(selectLocales(declared, 'pt-br').map((l) => l.code), ['pt-BR']);
// A repeated locale must not start two instances fighting over one mount path.
assert.deepEqual(selectLocales(declared, 'fr,fr').map((l) => l.code), ['fr']);
assert.throws(() => selectLocales(declared, 'zz'), /Unknown locale: zz/);
assert.throws(() => selectLocales(declared, 'fr,zz'), /angular\.json declares: en, fr, pt-BR/);
assert.throws(() => selectLocales(declared, ''), /needs at least one locale code/);
// "all" is a keyword on its own, not a code that can be mixed in.
assert.throws(() => selectLocales(declared, 'all,fr'), /Unknown locale: all/);

// End to end: an unknown locale stops the run before any ng serve is spawned.
const badLocale = spawnSync(
  'node',
  [
    path.join(root, 'bin/polyglot.mjs'),
    `--config=${path.join(__dirname, 'fixtures/angular.json')}`,
    '--locales=zz',
  ],
  { encoding: 'utf-8' },
);
assert.equal(badLocale.status, 1, 'unknown locale should exit 1');
assert.match(badLocale.stderr, /Unknown locale: zz/);
assert.doesNotMatch(badLocale.stdout, /Which locales to run/, 'no prompt when --locales is given');

// Near misses are refused rather than ignored: a silently dropped --locale would
// stop on the prompt in a script that has no one to answer it.
for (const arg of ['--locale=fr', '-lg=fr', '--lang=fr', '-l', '--language=fr']) {
  const hint = spawnSync('node', [path.join(root, 'bin/polyglot.mjs'), arg], { encoding: 'utf-8' });
  assert.equal(hint.status, 1, `${arg} should exit 1`);
  assert.match(hint.stderr, /is not a polyglot option/);
  assert.match(hint.stderr, /--locales=/);
}

// 8. TLS options
// The pair under fixtures/tls/ is a throwaway self-signed certificate, committed
// for this test only (see the comment at the top of each file).
const tlsDir = path.join(__dirname, 'fixtures/tls');
const certPath = path.join(tlsDir, 'cert.pem');
const keyPath = path.join(tlsDir, 'key.pem');
const missingPath = path.join(tlsDir, 'missing.pem');

// Neither → plain HTTP, exactly as before.
assert.equal(readTlsOptions({}), null);
assert.equal(readTlsOptions(), null);
// Both → the PEM contents, ready for https.createServer().
const tls = readTlsOptions({ certPath, keyPath });
assert.match(tls.cert.toString(), /BEGIN CERTIFICATE/);
assert.match(tls.key.toString(), /BEGIN PRIVATE KEY/);
// Only one → refused, naming the one given and the one missing.
assert.throws(() => readTlsOptions({ certPath }), /--ssl-cert=.*cert\.pem needs --ssl-key=<path>/);
assert.throws(() => readTlsOptions({ keyPath }), /--ssl-key=.*key\.pem needs --ssl-cert=<path>/);
// Unreadable → refused, naming the option and the path.
assert.throws(
  () => readTlsOptions({ certPath: missingPath, keyPath }),
  /--ssl-cert: cannot read ".*missing\.pem" \(ENOENT\)/,
);
assert.throws(
  () => readTlsOptions({ certPath, keyPath: tlsDir }),
  /--ssl-key: cannot read ".*tls" \(EISDIR\)/,
);
// Readable but not a key: caught now, not when the proxy finally listens.
assert.throws(
  () => readTlsOptions({ certPath, keyPath: certPath }),
  /not a usable certificate and key/,
);

// End to end: refused before the config is even read — so before the locale
// prompt and before any ng serve is spawned.
const polyglot = (...args) =>
  spawnSync(
    'node',
    [
      path.join(root, 'bin/polyglot.mjs'),
      `--config=${path.join(__dirname, 'fixtures/angular.json')}`,
      '--locales=en',
      ...args,
    ],
    { encoding: 'utf-8' },
  );
for (const [args, expected] of [
  [[`--ssl-cert=${certPath}`], /--ssl-cert=.*cert\.pem needs --ssl-key=<path>/],
  [[`--ssl-key=${keyPath}`], /--ssl-key=.*key\.pem needs --ssl-cert=<path>/],
  [[`--ssl-cert=${missingPath}`, `--ssl-key=${keyPath}`], /--ssl-cert: cannot read ".*missing\.pem"/],
  [[`--ssl-cert=${certPath}`, `--ssl-key=${missingPath}`], /--ssl-key: cannot read ".*missing\.pem"/],
  // `ng serve --ssl` habits: ignored, they would quietly start in plain HTTP.
  [['--ssl'], /"--ssl" is not a polyglot option[\s\S]*--ssl-cert=<path> --ssl-key=<path>/],
  [['--ssl-cert', certPath], /"--ssl-cert" takes its path after an "=": --ssl-cert=<path>/],
  // Passed through, a child would serve HTTPS behind the proxy's http:// target.
  [['--', '--ssl'], /"--ssl" is managed by polyglot[\s\S]*--ssl-cert=<path> --ssl-key=<path>/],
  [['--', '--ssl-cert=x'], /"--ssl-cert=x" is managed by polyglot/],
  [['--', '--ssl-key=x'], /"--ssl-key=x" is managed by polyglot/],
]) {
  const run = polyglot(...args);
  assert.equal(run.status, 1, `${args.join(' ')} should exit 1`);
  assert.match(run.stderr, expected);
  assert.doesNotMatch(run.stdout, /Project:|Starting ng/, `${args.join(' ')}: nothing started`);
}
assert.match(help.stdout, /--ssl-cert=<path>/, 'help documents --ssl-cert');
assert.match(help.stdout, /--ssl-key=<path>/, 'help documents --ssl-key');
assert.doesNotMatch(help.stdout, /-- --ssl/, 'help no longer suggests a passthrough --ssl');

// 9. The proxy server, in HTTPS, in front of dummy HTTP children (stand-ins for
// ng serve). Each child answers with its name and the path it received, and
// after a bare 101 echoes WebSocket bytes back the same way: no WebSocket
// library needed, past the handshake the proxy only relays bytes.
const sockets = new Set(); // every socket on every side, destroyed at the end
const track = (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
};
function dummyChild(name) {
  const server = http.createServer((req, res) => res.end(`${name} ${req.url}`));
  server.on('connection', track);
  server.on('upgrade', (req, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    );
    socket.on('data', (data) => socket.write(`${name} ${req.url} ${data}`));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
const en = await dummyChild('en');
const fr = await dummyChild('fr');
const { app, upgrade } = createProxyApp(
  [
    { baseHref: '/en/', target: `http://localhost:${en.address().port}` },
    { baseHref: '/fr/', target: `http://localhost:${fr.address().port}` },
  ],
  '/en/',
);
const proxy = await listen(app, { port: 0, host: '127.0.0.1', tls, upgrade });
proxy.on('connection', track);
const proxyPort = proxy.address().port;

// A self-signed certificate: trusted explicitly here, as a browser would after
// the user accepts it.
const httpsGet = (urlPath) =>
  new Promise((resolve, reject) => {
    https
      .get(
        // agent: false → a fresh handshake each time. A session resumed from the
        // agent's cache carries no peer certificate to check.
        { host: '127.0.0.1', port: proxyPort, path: urlPath, rejectUnauthorized: false, agent: false },
        (res) => {
          // Read now: by 'end' the socket is back in the agent's pool.
          const peer = res.socket.getPeerCertificate().subject?.CN;
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ res, body, peer }));
        },
      )
      .on('error', reject);
  });

// wss://: the upgrade goes through TLS, then one message is echoed back.
const wss = (urlPath) =>
  new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1',
      port: proxyPort,
      path: urlPath,
      rejectUnauthorized: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    });
    req.on('upgrade', (res, socket) => {
      track(socket);
      socket.once('data', (data) => {
        socket.destroy();
        resolve({ status: res.statusCode, echo: String(data) });
      });
      socket.write('ping');
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode, echo: null });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error(`no answer to the upgrade on ${urlPath}`)));
    req.end();
  });

// Upgrades first, before any HTTP request has gone through: the proxy must not
// depend on a page load to start relaying them, and each locale's socket must
// reach that locale's instance, with its full path.
assert.deepEqual(await wss('/fr/ws?token=1'), { status: 101, echo: 'fr /fr/ws?token=1 ping' });
assert.deepEqual(await wss('/en/'), { status: 101, echo: 'en /en/ ping' });
assert.equal((await wss('/nowhere/ws')).status, 404, 'an upgrade under no locale is refused');

const page = await httpsGet('/fr/hello?x=1');
assert.equal(page.res.statusCode, 200);
assert.equal(page.body, 'fr /fr/hello?x=1', 'full path re-injected for the instance');
assert.equal(page.peer, 'localhost', 'served with the given certificate');
assert.equal((await httpsGet('/en/')).body, 'en /en/');
const elsewhere = await httpsGet('/nowhere');
assert.equal(elsewhere.res.statusCode, 302);
assert.equal(elsewhere.res.headers.location, '/en/');

// After page loads on both locales, an upgrade still reaches one instance only:
// a second 101 relayed from another instance would arrive here as data.
assert.deepEqual(await wss('/fr/ws'), { status: 101, echo: 'fr /fr/ws ping' });
assert.deepEqual(await wss('/en/ws'), { status: 101, echo: 'en /en/ws ping' });
// Case-insensitive, like the Express mounts that serve the page itself.
assert.deepEqual(await wss('/FR/ws'), { status: 101, echo: 'fr /FR/ws ping' });

// The same proxy without `tls` is plain HTTP, as before.
const plain = await listen(app, { port: 0, host: '127.0.0.1', upgrade });
plain.on('connection', track);
const plainBody = await new Promise((resolve, reject) => {
  http
    .get({ host: '127.0.0.1', port: plain.address().port, path: '/fr/' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
    })
    .on('error', reject);
});
assert.equal(plainBody, 'fr /fr/');

// A port already taken is reported, not thrown from an unhandled 'error' event.
await assert.rejects(
  listen(app, { port: proxyPort, host: '127.0.0.1', tls }),
  /EADDRINUSE/,
);

// End to end: the proxy port is bound before any ng serve is spawned, so a
// port already taken stops the run straight away. Held on 0.0.0.0, the
// interface polyglot binds: some systems (macOS) let 0.0.0.0:<port> coexist
// with a listener on 127.0.0.1:<port>.
const holder = await listen(app, { port: 0, host: '0.0.0.0' });
const taken = polyglot(`--port=${holder.address().port}`);
holder.close();
assert.equal(taken.status, 1, 'a port already taken should exit 1');
assert.match(taken.stderr, /EADDRINUSE/);
assert.doesNotMatch(taken.stdout, /Starting ng/, 'no ng serve spawned for a proxy that cannot listen');

for (const socket of sockets) socket.destroy();
await Promise.all([en, fr, proxy, plain].map((s) => new Promise((r) => s.close(r))));

console.log('✓ smoke tests passed');
