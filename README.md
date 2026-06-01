# @softwarity/polyglot

[![npm version](https://img.shields.io/npm/v/@softwarity/polyglot.svg)](https://www.npmjs.com/package/@softwarity/polyglot)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-%E2%89%A517-dd0031)](https://angular.dev/guide/i18n)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-brightgreen)](https://nodejs.org)
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
| `--help` | — | Print usage and exit |

There is intentionally **no** `--prebundle` flag and **no** locale flag: locales are
chosen interactively, and Vite prebundling is derived from your selection (off for
multiple locales, on for one — see below).

## How it works

- Reads `i18n`, `baseHref` and `serve` configs from `angular.json`.
- Picks a free **private** port per locale and spawns `ng serve --configuration=<locale>`
  bound to `127.0.0.1`.
- Runs **one** Express proxy on the public port, routing each locale's `subPath`
  (`<baseHref><subPath>`) to its `ng serve` instance; any other path redirects to the source locale.
- Tears everything down on exit (`SIGTERM` → `SIGKILL`) — no orphan servers.

**Prebundling.** Angular's dev-server runs on Vite, which pre-bundles dependencies into
a shared `.angular/cache` directory. With several `ng serve` running at once, each
optimizer keeps invalidating the others (*"There is a new version of the pre-bundle…"*),
wedging SSR in a re-optimize loop. So polyglot disables prebundling automatically when
more than one locale runs, and keeps it on for a single locale.

## Requirements

A standard Angular i18n setup in `angular.json`:

- an `i18n` block with `sourceLocale` and `locales` (each may declare a `subPath`);
- a **build** configuration per locale with a matching `baseHref` (`"/<subPath>/"`);
- a **serve** configuration per locale (`ng serve --configuration=<code>`).

See the [Angular setup guide](https://softwarity.github.io/polyglot/#/angular-setup).

## License

MIT © [Softwarity](https://www.softwarity.io/)
