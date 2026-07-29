# Release Notes

## NEXT RELEASE

### Licensing
- **Relicensed under Apache-2.0** - The project moves from MIT to Apache-2.0. The Apache licence adds an explicit patent grant and requires changed files to be marked, which MIT does not cover. `LICENSE`, the `license` field of `package.json` and the README badge are updated accordingly.

### Improvements
- **Lower Node requirement: `>=18.19.1`** (was `>=20`) - Node 18.19.1 is the version Angular 17+ itself requires, so polyglot no longer forces a newer runtime than the projects it serves.

### Fixes
- **License badge on the docs site** - The deployed demo/docs page still advertised MIT after the relicensing; it now shows Apache-2.0.

### Tooling
- **Release flow via `softwarity/release-flow@v1`** - Releasing no longer bumps and pushes by hand: the action resolves this `## NEXT RELEASE` section into the new version, tags `v<version>`, and publishes the matching GitHub Release. The NPM-token check and the smoke test still run before anything is tagged.

---

## 1.0.0

Initial public release of `@softwarity/polyglot`.

### Features
- **Every locale behind one dev port** - `ng serve` only runs one locale at a time, so the real multi-locale URL shape never appears in development. polyglot reads `angular.json`, spawns one `ng serve` per locale on a private port, and puts a single proxy in front — `/en/`, `/fr/`, `/vi/`… all served from one URL, exactly like the deployed site.
- **`polyglot init`** - Writes a ready-to-run `start:i18n` script into `package.json`, with the defaults spelled out so they can be reviewed and tweaked.
- **Locale selection at startup** - Choose which locales to start rather than paying for all of them on every run.
- **Zero configuration by default** - Locales, base href and output paths are read from the existing `angular.json`; nothing is duplicated in a polyglot-specific config.

### Requirements
- Angular ≥ 17, Node ≥ 20 (lowered to 18.19.1 in the next release).

---
