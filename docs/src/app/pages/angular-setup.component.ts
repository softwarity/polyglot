import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-angular-setup',
  imports: [CodeComponent, RouterLink],
  template: `
    <h2>Angular setup</h2>

    <p>
      There is <strong>nothing polyglot-specific to configure</strong>. polyglot reads the
      <strong>standard Angular i18n setup</strong> straight from your <code>angular.json</code> — the
      one you create with the Angular CLI by following the
      <a href="https://angular.dev/guide/i18n" target="_blank" rel="noopener">official Angular i18n guide</a>.
      If your app is already localized the Angular way, you're done; this page just shows what polyglot
      reads.
    </p>

    <h3>Supported Angular versions</h3>
    <p>
      polyglot doesn't import Angular — it shells out to your project's own <code>ng serve</code>. So
      the requirement is your project's <strong>build system</strong>, not a pinned version:
    </p>
    <table>
      <thead>
        <tr><th>Angular</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>&ge; 17</strong></td>
          <td>
            ✅ Supported. The application builder (<code>&#64;angular/build</code>) and its Vite
            dev-server became the default in v17, providing the <code>--prebundle</code> flag and the
            clean single-locale dev serving polyglot relies on.
          </td>
        </tr>
        <tr>
          <td><strong>&ge; 19.1</strong></td>
          <td>
            ✅ + native <code>subPath</code> routing. The CLI derives each locale's output directory
            and base href from <code>i18n.*.subPath</code>; polyglot routes on it directly.
          </td>
        </tr>
        <tr>
          <td>17 – 19.0</td>
          <td>
            ✅ <code>subPath</code> doesn't exist yet, so polyglot routes by <strong>locale code</strong>
            (which is the output directory name in that range anyway).
          </td>
        </tr>
        <tr>
          <td>&lt; 17 (webpack <code>browser</code> builder)</td>
          <td>
            ✅ Works too. The webpack dev-server has no <code>--prebundle</code> option — polyglot
            detects the builder and skips the flag, which is safe because there is no shared Vite
            cache to invalidate in the first place.
          </td>
        </tr>
      </tbody>
    </table>
    <div class="callout">
      <strong>Why one ng serve per locale?</strong> Angular's dev-server localizes
      <em>one locale at a time</em> — <code>localize</code> must be <code>false</code> or a
      single-element array. polyglot turns that into multi-locale dev by running one mono-locale
      <code>ng serve</code> per locale and proxying them. Tested on <strong>Angular 21</strong>.
    </div>

    <h3>Set it up with the Angular CLI</h3>
    <p>
      Add the localize package — the CLI wires up the polyfill and prepares the workspace for i18n:
    </p>
    <app-code lang="bash">ng add &#64;angular/localize</app-code>
    <p>
      Then follow the guide to declare your locales, extract messages
      (<code>ng extract-i18n</code>) and add the per-locale build/serve configurations. The CLI and the
      Angular docs are the source of truth for the blocks below — polyglot only consumes them.
    </p>
    <div class="callout">
      The three sections that follow (<strong>i18n</strong>, <strong>build</strong>,
      <strong>serve</strong>) are exactly what the
      <a href="https://angular.dev/guide/i18n/merge" target="_blank" rel="noopener">Angular i18n guide</a>
      produces. They are shown here as a reference of what polyglot needs to find, not as extra steps to
      invent.
    </div>

    <h3>1. The i18n block</h3>
    <p>
      Declares your source locale and translations. Each entry may carry a <code>subPath</code>;
      polyglot routes on it and falls back to the locale code when it's absent.
    </p>
    <app-code lang="json">"i18n": &#123;
  "sourceLocale": &#123; "code": "en", "subPath": "en" &#125;,
  "locales": &#123;
    "fr": &#123; "translation": "src/locales/messages.fr.xlf", "subPath": "fr" &#125;,
    "vi": &#123; "translation": "src/locales/messages.vi.xlf", "subPath": "vi" &#125;
  &#125;
&#125;</app-code>

    <h3>2. A build configuration per locale</h3>
    <p>
      Each locale needs a build config that localizes it and sets a matching
      <code>baseHref</code> (<code>"/&lt;subPath&gt;/"</code>):
    </p>
    <app-code lang="json">"build": &#123;
  "configurations": &#123;
    "en": &#123; "localize": ["en"], "baseHref": "/en/" &#125;,
    "fr": &#123; "localize": ["fr"], "baseHref": "/fr/" &#125;,
    "vi": &#123; "localize": ["vi"], "baseHref": "/vi/" &#125;
  &#125;
&#125;</app-code>

    <h3>3. A serve configuration per locale</h3>
    <p>
      polyglot launches <code>ng serve --configuration=&lt;code&gt;</code>, so each locale (the source
      included) needs a serve config pointing at its build config:
    </p>
    <app-code lang="json">"serve": &#123;
  "configurations": &#123;
    "en": &#123; "buildTarget": "my-app:build:development,en" &#125;,
    "fr": &#123; "buildTarget": "my-app:build:development,fr" &#125;,
    "vi": &#123; "buildTarget": "my-app:build:development,vi" &#125;
  &#125;
&#125;</app-code>
    <div class="callout warn">
      The <strong>source locale</strong> may skip it: with no serve config, polyglot starts a plain
      <code>ng serve</code> on the default build — which already is the source locale, untranslated by
      definition. A <strong>translated</strong> locale has no such fallback (the default build carries
      none of its translations), so polyglot reports it and skips it rather than starting an instance
      that would fail. Add the config above to serve it.
    </div>

    <h3>What polyglot derives automatically</h3>
    <table>
      <thead>
        <tr><th>Value</th><th>Read from</th></tr>
      </thead>
      <tbody>
        <tr><td>Project</td><td>First project in <code>angular.json</code>, or <code>--project</code></td></tr>
        <tr><td>Source locale</td><td><code>i18n.sourceLocale</code> (string or <code>&#123; code, subPath &#125;</code>)</td></tr>
        <tr><td>Locales &amp; subPaths</td><td><code>i18n.locales</code> (subPath → fallback to code)</td></tr>
        <tr>
          <td>Base href per locale</td>
          <td>
            <code>architect.build.configurations.&lt;code&gt;.baseHref</code>, else
            <code>architect.build.options.baseHref</code> + <code>subPath</code> (default <code>/</code>)
          </td>
        </tr>
        <tr><td>Prebundling</td><td>Derived: off for multi-locale, on for single, never on webpack</td></tr>
      </tbody>
    </table>

    <div class="callout">
      Already use <a href="https://www.softwarity.io/" target="_blank" rel="noopener">Softwarity's</a>
      Angular i18n conventions? Then there's nothing to add — run
      <a routerLink="/">getting started</a> and you're done.
    </div>
  `,
})
export class AngularSetupComponent {}
