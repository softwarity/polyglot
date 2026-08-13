# @softwarity/polyglot

[![npm version](https://img.shields.io/npm/v/@softwarity/polyglot.svg)](https://www.npmjs.com/package/@softwarity/polyglot)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-%E2%89%A517-dd0031)](https://angular.dev/guide/i18n)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![CI](https://img.shields.io/github/actions/workflow/status/softwarity/polyglot/ci.yml?logo=githubactions&logoColor=white&label=CI)](https://github.com/softwarity/polyglot/actions/workflows/ci.yml)

> Serve **every locale** of an Angular i18n app at once, behind a single dev port.

`ng serve` runs one locale at a time, so you never see the real multi-locale URL
shape in development. **polyglot** reads your `angular.json`, spawns one `ng serve`
per locale on a private port, and puts a single proxy in front — so `/en/`, `/fr/`,
`/vi/`… all work from one URL, exactly like the deployed site.

📖 **Documentation:** https://softwarity.github.io/polyglot/

## Install

```bash
npm i -D @softwarity/polyglot
```

## Quick start

```bash
# 1. Add a ready-to-run script to package.json (writes "start:i18n")
npx polyglot init

# 2. Run it — pick which locales to start
npm run start:i18n
```

`init` writes the defaults so you can see and tweak them:

```json
"scripts": {
  "start:i18n": "polyglot --config=./angular.json --port=4200"
}
```

At launch, polyglot reads your locales and asks which to run (nothing is saved):

```text
Project: my-app — source locale: en — baseHref: /

Available locales:
  1. en  (source)
  2. fr
  3. vi

Which locales to run? Comma-separated numbers (e.g. "1,3"), "all" (default), or "q" to quit: all

▸ Proxy listening on 0.0.0.0:4200 — open one of:
    Local:   http://localhost:4200/
    en       → http://localhost:4200/en/  (ng serve :49b1)
    fr       → http://localhost:4200/fr/  (ng serve :49b2)
    vi       → http://localhost:4200/vi/  (ng serve :49b3)
▸ Fallback locale: en
```

## Commands & options

```bash
polyglot [options]         # Start the multi-locale dev proxy (default)
polyglot init [options]    # Add a "start:i18n" script to package.json
polyglot --help            # Show usage
```

| Option | Default | Description |
| --- | --- | --- |
| `--config=<path>` | `./angular.json` | Angular workspace config to read locales from |
| `--project=<name>` | first project | Project to serve (multi-project workspaces) |
| `--port=<number>` | `4200` (or `$PROXY_PORT`) | Public port for the proxy |
| `--build-configuration=<name>` | — | Build configuration composed with every locale (see below) |
| `--help` | — | Print usage and exit |

There is intentionally **no** `--prebundle` flag and **no** locale flag: locales are
chosen interactively, and Vite prebundling is derived from your selection (off for
multiple locales, on for one — see below).

## A configuration that cuts across locales

White-label builds, feature flags, per-customer variants — a configuration that is
orthogonal to the locale (`fileReplacements`, a different `outputPath`…) is composed
into every locale with `--build-configuration`:

```bash
polyglot --port=4200 --build-configuration=vatm
```

```text
[en] ng serve --browser-target=app:build:vatm
[fr] ng serve --configuration=fr --browser-target=app:build:vatm,fr
[lo] ng serve --configuration=lo --browser-target=app:build:vatm,lo
```

**Why it can't just be `ng serve --configuration=vatm,fr`.** Angular merges a target's
configurations left to right, last write wins. A *serve* configuration usually holds
nothing but a pointer to a build (`browserTarget` / `buildTarget`), so merging two of
them keeps one pointer and silently drops the other: you get either the locale's
translations or the shared configuration's options, never both — and the instance that
loses its locale also loses the `baseHref` the proxy mounts it on, which turns into a
redirect loop. *Build* configurations carry the real options (`localize`, `baseHref`,
`fileReplacements`), so that is where polyglot composes, by overriding the build target
of each instance.

The shared configuration is composed **first**, the locale **last** (`vatm,fr`), so the
locale wins every collision — a variant that sets its own `baseHref` can never move an
instance out from under its mount. The flag is read from `architect.build.configurations`
and validated before the locale prompt; the pointer key is detected per workspace
(`buildTarget` on Angular ≥ 17, `browserTarget` before).

## Passing options to `ng serve`

Everything after `--` is appended to **every** `ng serve` polyglot spawns:

```bash
polyglot --port=4200 -- --ssl --poll=2000
```

Through npm, the first `--` is swallowed by npm itself, so pass two:

```bash
npm run start:i18n -- -- --ssl
```

Passthrough options are appended last, so they win over polyglot's own defaults —
including `--prebundle`, which you can force back on (you'll get a warning explaining
why it is off for multiple locales).

Four flags are **refused** instead, because the proxy is built on them: `--port`,
`--host`, `--configuration` and `-c`. Each `ng serve` gets a private free port on
`127.0.0.1` that the proxy routes to, and its configuration comes from the locale you
picked. Use polyglot's own `--port=<number>` to change the public port.

## How it works

- Reads `i18n`, `baseHref` and `serve` configs from `angular.json`.
- Picks a free **private** port per locale and spawns `ng serve --configuration=<locale>`
  bound to `127.0.0.1`.
- Runs **one** Express proxy on the public port, routing each locale to its `ng serve`
  instance under its own base href; any other path redirects to the source locale.
- Tears everything down on exit (`SIGTERM` → `SIGKILL`) — no orphan servers.

**Base href per locale.** Each locale is mounted where *its own* build config says, in
this order: `build.configurations.<code>.baseHref` if present, otherwise
`build.options.baseHref` + `<subPath>/`. If that default base href already ends with the
source locale's subPath (`"/app/en/"` — common when the default build ships the source
locale), it is taken as the source locale's base href as-is, and the remaining root
(`/app/`) is what the other locales hang off of. No `/en/en/` double mount.

**Prebundling.** Angular's dev-server runs on Vite, which pre-bundles dependencies into
a shared `.angular/cache` directory. With several `ng serve` running at once, each
optimizer keeps invalidating the others (*"There is a new version of the pre-bundle…"*),
wedging SSR in a re-optimize loop. So polyglot disables prebundling automatically when
more than one locale runs, and keeps it on for a single locale. On the legacy webpack
dev-server the flag doesn't exist (and there is no shared Vite cache to protect), so it
is never passed.

## Requirements

A standard Angular i18n setup in `angular.json`:

- an `i18n` block with `sourceLocale` and `locales` (each may declare a `subPath`);
- a **build** configuration per locale with a matching `baseHref` (`"/<subPath>/"`);
- a **serve** configuration per locale (`ng serve --configuration=<code>`).

The **source locale** may skip both: if it has no serve configuration, polyglot starts a
plain `ng serve` on the default build (which is already the source locale, untranslated
by definition) and mounts it under its resolved base href. A **translated** locale
without a serve configuration has no such fallback — the default build carries none of
its translations — so it is reported and skipped instead of crashing the session.

Both build systems work: the esbuild/Vite dev-server (Angular ≥ 17) and the legacy
webpack one (`@angular-devkit/build-angular:browser`).

See the [Angular setup guide](https://softwarity.github.io/polyglot/#/angular-setup).

## License

Apache-2.0 © [Softwarity](https://www.softwarity.io/)
