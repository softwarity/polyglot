import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-troubleshooting',
  imports: [CodeComponent, RouterLink],
  template: `
    <h2>Troubleshooting</h2>

    <h3>"There is a new version of the pre-bundle…" / SSR hangs</h3>
    <p>
      That's the Vite pre-bundle loop that happens when several <code>ng serve</code> share one cache.
      polyglot already prevents it by disabling prebundling whenever more than one locale runs — so if
      you see this, check the banner says <em>"Vite prebundling: off (multi-locale)"</em>. If you
      forced a single locale and still hit it, clear the cache:
    </p>
    <app-code lang="bash">rm -rf .angular/cache</app-code>

    <h3>"No serve configuration for &lt;locale&gt;"</h3>
    <p>
      A selected locale has no <code>architect.serve.configurations.&lt;code&gt;</code> entry in
      <code>angular.json</code>. polyglot warns and starts anyway, but that instance will likely fail.
      Add the serve config (and its build config) shown in
      <a routerLink="/angular-setup">Angular setup</a>.
    </p>

    <h3>The proxy port is already in use</h3>
    <p>
      The public port (default <code>4200</code>) is taken. Pick another — the per-locale instance
      ports are chosen automatically and never collide:
    </p>
    <app-code lang="bash">polyglot --port=5200</app-code>

    <h3>Redirect loop on a locale path</h3>
    <p>
      Usually a <code>baseHref</code> mismatch: each locale's build config must set
      <code>"baseHref": "/&lt;subPath&gt;/"</code>, matching its <code>subPath</code> in the i18n
      block. polyglot mounts each locale at <code>&lt;baseHref&gt;&lt;subPath&gt;</code> and re-injects
      the original URL toward the instance; if the instance's <code>baseHref</code> disagrees, it
      bounces. Align them and the loop disappears.
    </p>

    <h3>Can't reach it from another device on the LAN</h3>
    <p>
      The proxy listens on <code>0.0.0.0</code> and prints a <em>Network</em> URL at startup using your
      first non-internal IPv4 address. Use that URL from the other device, and make sure your firewall
      allows the port. The per-locale instances stay private on <code>127.0.0.1</code> by design.
    </p>

    <h3>Wrong project picked in a multi-project workspace</h3>
    <p>polyglot defaults to the first project in <code>angular.json</code>. Name the one you want:</p>
    <app-code lang="bash">polyglot --project=web</app-code>

    <h3>It says my app has no i18n</h3>
    <p>
      polyglot needs an <code>i18n</code> section in the project. If you serve a single, non-localized
      app, you don't need polyglot — use <code>ng serve</code> directly. Otherwise add the i18n config
      from <a routerLink="/angular-setup">Angular setup</a>.
    </p>

    <div class="callout">
      Still stuck? Open an issue on
      <a href="https://github.com/softwarity/polyglot/issues" target="_blank" rel="noopener">GitHub</a>
      with your <code>angular.json</code> i18n/serve blocks and the startup banner.
    </div>
  `,
})
export class TroubleshootingComponent {}
