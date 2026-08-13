import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-cli-reference',
  imports: [CodeComponent, RouterLink],
  template: `
    <h2>CLI reference</h2>

    <h3>Commands</h3>
    <app-code lang="bash">polyglot [options] [-- &lt;ng serve args&gt;]   # Start the multi-locale dev proxy (default)
polyglot init [options]                   # Add a "start:i18n" script to package.json
polyglot --help                           # Show usage</app-code>

    <h3>Options</h3>
    <p>Every option has a sensible default and can be overridden on the command line.</p>
    <table>
      <thead>
        <tr><th>Option</th><th>Default</th><th>Description</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><code>--config=&lt;path&gt;</code></td>
          <td><code>./angular.json</code></td>
          <td>Path to the Angular workspace config to read locales from.</td>
        </tr>
        <tr>
          <td><code>--project=&lt;name&gt;</code></td>
          <td>first project</td>
          <td>Which project in <code>angular.json</code> to serve (useful in a multi-project workspace).</td>
        </tr>
        <tr>
          <td><code>--port=&lt;number&gt;</code></td>
          <td><code>4200</code></td>
          <td>Public port for the proxy. Also read from <code>$PROXY_PORT</code>.</td>
        </tr>
        <tr>
          <td><code>--locales=&lt;codes&gt;</code></td>
          <td>ask</td>
          <td>Locales to run — <code>fr,lo</code> or <code>all</code>. Skips the interactive prompt.</td>
        </tr>
        <tr>
          <td><code>--build-configuration=&lt;name&gt;</code></td>
          <td>—</td>
          <td>Build configuration composed with every locale — for a variant that cuts across locales.</td>
        </tr>
        <tr>
          <td><code>--help</code></td>
          <td>—</td>
          <td>Print usage and exit.</td>
        </tr>
      </tbody>
    </table>
    <div class="callout">
      There is intentionally <strong>no</strong> <code>--prebundle</code> flag: Vite prebundling is
      <a routerLink="/how-it-works">derived from your selection</a>.
    </div>

    <h3>Running without the prompt</h3>
    <p>
      The locale prompt is there for interactive work; a script, a container or a tunnel has
      nobody to answer it. <code>--locales</code> picks them up front and starts straight away.
    </p>
    <app-code lang="bash">polyglot --port=4200 --locales=fr           # one locale
polyglot --port=4200 --locales=fr,lo,ar     # a selection, in that order
polyglot --port=4200 --locales=all          # everything angular.json declares</app-code>
    <p>
      Codes are matched case-insensitively (<code>pt-br</code> finds <code>pt-BR</code>), repeats
      collapse — two instances of one locale would fight over the same mount path — and an unknown
      code stops the run, listing the declared ones, before anything is spawned.
    </p>

    <h3>A configuration that cuts across locales</h3>
    <p>
      White-label builds, feature flags, per-customer variants — a configuration orthogonal to
      the locale (<code>fileReplacements</code>, a different <code>outputPath</code>…) is composed
      into every locale with <code>--build-configuration</code>.
    </p>
    <app-code lang="bash">polyglot --port=4200 --build-configuration=vatm

[en] ng serve --browser-target=app:build:vatm
[fr] ng serve --configuration=fr --browser-target=app:build:vatm,fr
[lo] ng serve --configuration=lo --browser-target=app:build:vatm,lo</app-code>
    <p>
      <strong>Why not simply <code>ng serve --configuration=vatm,fr</code>?</strong> Angular merges
      a target's configurations left to right, last write wins. A <em>serve</em> configuration
      usually holds nothing but a pointer to a build (<code>browserTarget</code> /
      <code>buildTarget</code>), so merging two of them keeps one pointer and silently drops the
      other: you get either the locale's translations or the shared configuration's options, never
      both — and the instance that loses its locale also loses the <code>baseHref</code> the proxy
      mounts it on, which turns into a redirect loop. <em>Build</em> configurations carry the real
      options (<code>localize</code>, <code>baseHref</code>, <code>fileReplacements</code>), so that
      is where polyglot composes, by overriding each instance's build target.
    </p>
    <div class="callout">
      The shared configuration comes <strong>first</strong>, the locale <strong>last</strong>
      (<code>vatm,fr</code>), so the locale wins every collision — a variant that sets its own
      <code>baseHref</code> can never move an instance out from under its mount. The name is read
      from <code>architect.build.configurations</code> and validated before the locale prompt; the
      pointer key is detected per workspace (<code>buildTarget</code> on Angular ≥ 17,
      <code>browserTarget</code> before).
    </div>

    <h3>Passing options to <code>ng serve</code></h3>
    <p>
      Everything after <code>--</code> is appended to <strong>every</strong> <code>ng serve</code>
      polyglot spawns. Through npm the first <code>--</code> is swallowed by npm itself, so pass two.
    </p>
    <app-code lang="bash">polyglot --port=4200 -- --ssl --poll=2000

# through an npm script
npm run start:i18n -- -- --ssl</app-code>
    <p>
      Passthrough options are appended last, so they win over polyglot's own defaults — including
      <code>--prebundle</code>, which you can force back on (you'll get a warning explaining why it
      is off for multiple locales).
    </p>
    <div class="callout">
      Four flags are <strong>refused</strong> instead, because the proxy is built on them:
      <code>--port</code>, <code>--host</code>, <code>--configuration</code> and <code>-c</code>.
      Each <code>ng serve</code> gets a private free port on <code>127.0.0.1</code> that the proxy
      routes to, and its configuration comes from the locale you picked. Use polyglot's own
      <code>--port=&lt;number&gt;</code> to change the public port.
    </div>

    <h3>The <code>init</code> command</h3>
    <p>
      A pure convenience — <strong>entirely optional</strong>. It writes a <code>start:i18n</code>
      script to the nearest <code>package.json</code>, embedding the <code>--config</code> and
      <code>--port</code> you pass so they're visible and editable, and never overwrites an existing
      script of that name. You can skip <code>init</code> and add the script by hand under any name —
      for example replacing your per-locale <code>start:en</code>/<code>start:fr</code>… scripts with a
      single <code>"start": "polyglot"</code>.
    </p>
    <app-code lang="bash"># default
npx polyglot init
#   → "start:i18n": "polyglot --config=./angular.json --port=4200"

# custom port + config
npx polyglot init --port=5200 --config=./projects/web/angular.json
#   → "start:i18n": "polyglot --config=./projects/web/angular.json --port=5200"</app-code>

    <h3>Examples</h3>
    <app-code lang="bash"># Run on a different port
polyglot --port=5200

# Target a specific project in a multi-project workspace
polyglot --project=web --config=./angular.json

# Same, via environment variable
PROXY_PORT=5200 polyglot

# Forward options to every ng serve
polyglot --port=5200 -- --ssl --poll=2000

# Compose a cross-locale build configuration, and forward options too
polyglot --port=5200 --build-configuration=vatm -- --ssl

# Fully scripted: no prompt, one variant, three locales
polyglot --port=5200 --locales=fr,lo,ar --build-configuration=vatm</app-code>

    <h3>Exit &amp; cleanup</h3>
    <p>
      Press <code>Ctrl+C</code> (or answer <code>q</code> at the prompt) to stop. polyglot sends
      <code>SIGTERM</code> to every <code>ng serve</code> child, then <code>SIGKILL</code> to any that
      survive the grace period — and tears everything down if an instance dies on its own, so you're
      never left with orphan servers or a proxy pointing at dead instances.
    </p>
  `,
})
export class CliReferenceComponent {}
