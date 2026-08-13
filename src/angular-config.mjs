import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Normalize a baseHref to a clean "/segment/" form, with a leading and trailing
 * slash. At the domain root this stays "/" — NOT "//", which would break mount
 * paths and produce protocol-relative redirects.
 */
function normalizeBaseHref(raw) {
  const stripped = String(raw || '').replace(/^\/+|\/+$/g, '');
  return stripped ? '/' + stripped + '/' : '/';
}

/**
 * True for the builders served by the esbuild/Vite dev-server — the only ones
 * that know `--prebundle`. The legacy webpack `browser` builder (and anything
 * built on it) rejects the flag outright: "Unknown argument: prebundle".
 */
function supportsPrebundleFlag(builder) {
  return /:(application|browser-esbuild)$/.test(builder || '');
}

/**
 * Which key a workspace uses to point its dev-server at a build target: Angular
 * renamed `browserTarget` to `buildTarget` in 17. Read it off the workspace
 * instead of guessing from a version we don't have — and when the project
 * declares neither (no serve options, no serve configurations), fall back to the
 * builder: the legacy webpack `browser` builder predates the rename.
 */
function detectBuildTargetKey(serve, buildBuilder) {
  const declarations = [serve.options, ...Object.values(serve.configurations || {})].filter(Boolean);
  for (const key of ['buildTarget', 'browserTarget']) {
    if (declarations.some((decl) => typeof decl[key] === 'string')) return key;
  }
  return /:browser$/.test(buildBuilder || '') ? 'browserTarget' : 'buildTarget';
}

/**
 * Read the i18n setup of an Angular project from its angular.json.
 *
 * Everything polyglot needs is already declared in angular.json, so nothing is
 * asked twice and nothing is persisted: we derive the locales, their subPaths
 * and their baseHrefs straight from the config.
 *
 * @param {object} opts
 * @param {string} opts.configPath  Absolute path to angular.json.
 * @param {string} [opts.projectName]  Project to use; defaults to the first one.
 * @returns {{
 *   projectName: string,
 *   projectRoot: string,          // dir containing angular.json — cwd for ng serve
 *   sourceLocale: {code: string, subPath: string},
 *   locales: Array<{
 *     code: string,
 *     subPath: string,
 *     isSource: boolean,
 *     hasServeConfig: boolean,
 *     baseHref: string,           // full public prefix for THIS locale, e.g. "/app/fr/"
 *     buildTarget: string,        // build this locale serves, e.g. "app:build:fr"
 *   }>,
 *   baseHref: string,             // shared root every locale hangs off of, e.g. "/app/"
 *   buildBuilder: string,         // architect.build.builder, '' when absent
 *   supportsPrebundle: boolean,   // whether `ng serve --prebundle=false` is a valid flag
 *   buildTargetKey: string,       // "buildTarget" (Angular ≥ 17) or "browserTarget"
 *   buildConfigNames: string[],   // names declared under architect.build.configurations
 * }}
 */
export function readAngularConfig({ configPath, projectName }) {
  let conf;
  try {
    conf = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read Angular config at ${configPath}: ${err.message}`);
  }

  const projects = conf.projects || {};
  const name = projectName || Object.keys(projects)[0];
  if (!name) throw new Error(`No projects found in ${configPath}`);
  const project = projects[name];
  if (!project) {
    throw new Error(
      `Project "${name}" not found in ${configPath}. Available: ${Object.keys(projects).join(', ') || '(none)'}`,
    );
  }

  const i18n = project.i18n;
  if (!i18n) {
    throw new Error(
      `Project "${name}" has no "i18n" section in angular.json — nothing to serve as multi-locale.`,
    );
  }

  // sourceLocale can be a bare string ("en") or an object ({ code, subPath }).
  const src = i18n.sourceLocale;
  const sourceCode = typeof src === 'string' ? src : src?.code || 'en';
  const sourceSubPath = (typeof src === 'object' && src?.subPath) || sourceCode;
  const sourceLocale = { code: sourceCode, subPath: sourceSubPath };

  // Each entry in i18n.locales can carry its own subPath; fall back to the code.
  const others = Object.entries(i18n.locales || {}).map(([code, value]) => ({
    code,
    subPath: (value && typeof value === 'object' && value.subPath) || code,
  }));

  const build = project.architect?.build || {};
  const buildConfigs = build.configurations || {};

  // The default baseHref is NOT automatically the shared root: plenty of projects
  // point build.options.baseHref straight at the source locale ("/app/en/"),
  // because the default build is the one that ships that locale. Appending the
  // subPath to it again would mount the source at "/app/en/en/" and drag every
  // other locale under "/app/en/" too — so the source suffix is detected and
  // peeled off to recover the root the locales actually hang off of.
  const defaultBaseHref = normalizeBaseHref(build.options?.baseHref);
  const sourceScopedDefault = defaultBaseHref.endsWith(`/${sourceSubPath}/`);
  const baseHref = sourceScopedDefault
    ? defaultBaseHref.slice(0, -(sourceSubPath.length + 1))
    : defaultBaseHref;

  /**
   * Full public prefix for one locale, in order of authority:
   *  1. its own build configuration's baseHref — already complete, use as-is;
   *  2. the source locale with a source-scoped default — that default IS its baseHref;
   *  3. otherwise the shared root plus the subPath (the classic case).
   */
  const resolveBaseHref = (locale, isSource) => {
    const declared = buildConfigs[locale.code]?.baseHref;
    if (declared) return normalizeBaseHref(declared);
    if (isSource && sourceScopedDefault) return defaultBaseHref;
    return `${baseHref}${locale.subPath}/`;
  };

  // Each locale is served via `ng serve --configuration=<code>`, so it needs a
  // matching serve configuration. We don't fail on a missing one (the source
  // locale sometimes has none) but we flag it so the caller can decide.
  const serve = project.architect?.serve || {};
  const serveConfigs = serve.configurations || {};
  const buildTargetKey = detectBuildTargetKey(serve, build.builder);

  /**
   * The build this locale's dev-server actually runs, e.g. "app:build:fr" — the
   * one place a shared configuration can be composed in (a serve configuration
   * holds nothing but this pointer, so merging two of them keeps one and drops
   * the other). A locale with no serve configuration inherits the serve
   * defaults, and failing that the project's plain build target: that is the
   * untranslated default build, which is exactly what the source locale serves.
   */
  const buildTargetOf = (code) =>
    serveConfigs[code]?.[buildTargetKey] || serve.options?.[buildTargetKey] || `${name}:build`;

  const decorate = (l, isSource) => ({
    ...l,
    isSource,
    hasServeConfig: Object.prototype.hasOwnProperty.call(serveConfigs, l.code),
    baseHref: resolveBaseHref(l, isSource),
    buildTarget: buildTargetOf(l.code),
  });

  return {
    projectName: name,
    projectRoot: path.dirname(configPath),
    sourceLocale,
    locales: [decorate(sourceLocale, true), ...others.map((l) => decorate(l, false))],
    baseHref,
    buildBuilder: build.builder || '',
    supportsPrebundle: supportsPrebundleFlag(build.builder),
    buildTargetKey,
    buildConfigNames: Object.keys(buildConfigs),
  };
}
