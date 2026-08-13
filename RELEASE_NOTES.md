# Release Notes

## NEXT RELEASE

---

## 1.2.2

### Improvements
- **Locales can be picked on the command line: `--locales=fr,lo` (or `all`)** - The startup prompt is fine interactively, but a script, a container or a tunnel has nobody to answer it and simply hangs there. `--locales` selects up front and starts straight away; codes are matched case-insensitively (`pt-br` finds `pt-BR`), repeats collapse — two instances of one locale would fight over the same mount path — and an unknown code stops the run with the declared codes listed, before anything is spawned. Options that don't exist but that fingers reach for (`--locale`, `--lang`, `-lg`, and `--configuration` for the flag below) are now refused with a pointer to the real one, instead of being ignored in silence and quietly running something else.
- **A build configuration can now cut across locales** - `polyglot --build-configuration=vatm` composes a shared configuration (white-label variant, feature flag, per-customer `fileReplacements`…) into every locale, which had no expression at all before: `ng serve --configuration=vatm,fr` cannot do it, because a serve configuration holds nothing but a pointer to a build target and merging two of them keeps one pointer and drops the other — you get the locale's translations or the variant, never both, and the instance that loses its locale also loses the `baseHref` the proxy mounts it on. polyglot composes where options really merge, on the build target itself (`--browser-target=app:build:vatm,fr`), with the locale last so it wins every collision. The name is validated against `architect.build.configurations` before the locale prompt, and the pointer key is detected per workspace (`buildTarget` on Angular ≥ 17, `browserTarget` before).

---

## 1.2.1

### Improvements
- **Options can now be forwarded to `ng serve`** - Everything after `--` is appended to every spawned command: `polyglot --port=4200 -- --ssl --poll=2000` (through npm, whose own parser eats the first separator: `npm run start:i18n -- -- --ssl`). Until now the only way to give `ng serve` a flag polyglot didn't know about was to stop using polyglot. Passthrough args land last, so they override polyglot's defaults where that makes sense — `--prebundle` can be forced back on for multiple locales, with a warning about the shared Vite cache. The four flags the proxy is built on (`--port`, `--host`, `--configuration`, `-c`) are rejected at startup rather than silently pointing the proxy at a server that isn't there.

---

## 1.2.0

### Compatibility
- **The legacy webpack `browser` builder now works** - Previously the only documented blocker for Angular < 17 was `--prebundle`, a flag that exists solely on the esbuild/Vite dev-server: polyglot passed it unconditionally as soon as two locales were selected, and `@angular-devkit/build-angular:browser` exited on the spot. The flag is now gated on the detected builder, and nothing else in polyglot is esbuild-specific — it shells out to the project's own `ng serve`.
- **Projects that never had a polyglot-shaped `angular.json`** - Between the per-locale base href resolution and the source-locale serve fallback below, a stock i18n workspace no longer needs configuration added just to be served: the source locale can keep having no build/serve configuration of its own, and per-locale `baseHref` values already declared for the deployed build are now honoured instead of ignored.

### Fixes
- **Source locale without a serve configuration no longer crashes** - polyglot warned about the missing `architect.serve.configurations.<code>` and then spawned `ng serve --configuration=<code>` anyway, which Angular rejects outright (`Configuration '<code>' is not set in the workspace`), killing the whole session. The source locale now falls back to a plain `ng serve` on the default build — the untranslated build *is* the source locale. A **translated** locale without a serve config has no safe fallback (the default build has none of its translations), so it is now reported and skipped instead of taking every other locale down with it.
- **No more `/<locale>/<locale>/` double mount** - The base href is resolved per locale instead of once globally. Each locale uses its own `build.configurations.<code>.baseHref` when it declares one (that information was in `angular.json` all along and was simply never read), and a default `build.options.baseHref` already ending with the source locale's subPath (`"/app/en/"`, the usual shape when the default build ships the source locale) is now recognised as *that locale's* base href rather than a root to append to — so `/app/` no longer redirects to `/app/en/en/`, and the other locales stay on `/app/<subPath>/` instead of inheriting the `en/` prefix. Mounts are ordered deepest-first so a locale sitting at a prefix of another's path can't swallow it.
- **`--prebundle=false` is no longer passed to the webpack dev-server** - The flag only exists on the esbuild/Vite dev-server; on `@angular-devkit/build-angular:browser` the CLI exits with `Unknown argument: prebundle`, so selecting two locales killed the session immediately. polyglot now detects the build builder and only passes the flag where it exists — the webpack dev-server has no shared Vite cache to protect anyway, so running several locales side by side works there too.

---

## 1.1.0

### Improvements
- **Language names in the locale prompt** - The startup list now shows each locale's English and native names next to its code (e.g. `1. fr, French, Français`), resolved locally via `Intl.DisplayNames` — no new dependency. Codes unknown to ICU keep showing the bare code.

---

## 1.0.1

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
