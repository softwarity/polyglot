import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Read the i18n setup of an Angular project from its angular.json.
 *
 * Everything polyglot needs is already declared in angular.json, so nothing is
 * asked twice and nothing is persisted: we derive the locales, their subPaths
 * and the proxy baseHref straight from the config.
 *
 * @param {object} opts
 * @param {string} opts.configPath  Absolute path to angular.json.
 * @param {string} [opts.projectName]  Project to use; defaults to the first one.
 * @returns {{
 *   projectName: string,
 *   projectRoot: string,          // dir containing angular.json — cwd for ng serve
 *   sourceLocale: {code: string, subPath: string},
 *   locales: Array<{code: string, subPath: string, isSource: boolean, hasServeConfig: boolean}>,
 *   baseHref: string,             // normalized, always starts and ends with '/'
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

  // baseHref is read from the build options; per-locale build configs override it
  // with "/<subPath>/" but the proxy only cares about the shared root prefix.
  const baseHrefRaw = project.architect?.build?.options?.baseHref || '/';
  // Normalize to a clean segment with leading and trailing slash, e.g. "/test-ui/".
  // At the domain root (baseHref "/") this stays "/" — NOT "//", which would break
  // mount paths and produce protocol-relative redirects.
  const stripped = baseHrefRaw.replace(/^\/+|\/+$/g, '');
  const baseHref = stripped ? '/' + stripped + '/' : '/';

  // Each locale is served via `ng serve --configuration=<code>`, so it needs a
  // matching serve configuration. We don't fail on a missing one (the source
  // locale sometimes has none) but we flag it so the caller can warn.
  const serveConfigs = project.architect?.serve?.configurations || {};
  const decorate = (l, isSource) => ({
    ...l,
    isSource,
    hasServeConfig: Object.prototype.hasOwnProperty.call(serveConfigs, l.code),
  });

  return {
    projectName: name,
    projectRoot: path.dirname(configPath),
    sourceLocale,
    locales: [decorate(sourceLocale, true), ...others.map((l) => decorate(l, false))],
    baseHref,
  };
}
