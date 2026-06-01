import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-cli-reference',
  imports: [CodeComponent, RouterLink],
  template: `
    <h2>CLI reference</h2>

    <h3>Commands</h3>
    <app-code lang="bash">polyglot [options]         # Start the multi-locale dev proxy (default)
polyglot init [options]    # Add a "start:i18n" script to package.json
polyglot --help            # Show usage</app-code>

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
          <td><code>--help</code></td>
          <td>—</td>
          <td>Print usage and exit.</td>
        </tr>
      </tbody>
    </table>
    <div class="callout">
      There is intentionally <strong>no</strong> <code>--prebundle</code> flag and <strong>no</strong>
      locale flag. Locales are chosen interactively at launch, and Vite prebundling is
      <a routerLink="/how-it-works">derived from your selection</a>.
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
PROXY_PORT=5200 polyglot</app-code>

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
