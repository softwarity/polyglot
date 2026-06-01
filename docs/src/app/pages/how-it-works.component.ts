import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-how-it-works',
  imports: [CodeComponent, RouterLink],
  template: `
    <h2>How it works</h2>

    <p>
      A localized Angular build emits one app per locale, each under its own sub-directory
      (<code>/en/</code>, <code>/fr/</code>…). In production a single server hosts them all and the
      <strong>path picks the language</strong>. <code>ng serve</code>, though, runs
      <strong>one locale at a time</strong> — so you never see the real multi-locale URL shape in dev.
      polyglot closes that gap.
    </p>

    <h3>The moving parts</h3>
    <p>On startup, polyglot:</p>
    <ul>
      <li>reads the project's <code>i18n</code>, <code>baseHref</code> and <code>serve</code> configs from <code>angular.json</code>;</li>
      <li>asks which locales to run (nothing is persisted);</li>
      <li>picks a <strong>free private port</strong> per locale and spawns <code>ng serve --configuration=&lt;locale&gt;</code> bound to <code>127.0.0.1</code>;</li>
      <li>starts <strong>one</strong> Express proxy on the public port that routes each locale's subPath to its <code>ng serve</code> instance.</li>
    </ul>

    <app-code lang="text">                         http://localhost:4200/
                                  │
                      ┌───────────┴───────────┐
                      │   polyglot proxy       │   (0.0.0.0:4200, the only public port)
                      └───────────┬───────────┘
            /en/* ────────────────┼──────────────── /fr/*        /vi/*
              │                   │                   │             │
      ng serve :49b1        (redirect /* →       ng serve :49b2  ng serve :49b3
      --configuration=en     source locale)     --configuration=fr  …=vi
      127.0.0.1 (private)                        127.0.0.1        127.0.0.1</app-code>

    <h3>Routing by subPath</h3>
    <p>
      Each locale is mounted at <code>&lt;baseHref&gt;&lt;subPath&gt;</code>. polyglot reads the
      <code>subPath</code> straight from your <code>angular.json</code> i18n config and falls back to
      the locale <em>code</em> if none is set — so it always matches what you actually ship. The proxy
      re-injects the original URL toward the instance, because each <code>ng serve</code> is itself
      configured with the full <code>baseHref</code> and would otherwise redirect-loop on <code>/</code>.
    </p>
    <p>Anything outside a known locale path is redirected (302) to the source locale:</p>
    <app-code lang="text">/            → 302 → /en/
/about       → 302 → /en/
/en/about    → ng serve (en)
/fr/about    → ng serve (fr)</app-code>
    <div class="callout">
      The <code>ng serve</code> instances bind to <code>127.0.0.1</code> only — private to the proxy. Just the proxy
      listens on <code>0.0.0.0</code>, so the app stays reachable from your LAN on a single port.
    </div>

    <h3>Why prebundling is turned off for multiple locales</h3>
    <p>
      Angular's dev-server runs on <strong>Vite</strong>, which pre-bundles your
      <code>node_modules</code> dependencies into a cache under
      <code>.angular/cache/.../vite/deps_ssr</code> to speed up cold starts.
    </p>
    <p>
      When several <code>ng serve</code> run at once in the same project, they
      <strong>share that one cache directory</strong>. Each optimizer keeps bumping the pre-bundle
      version and invalidating the others' in-flight requests
      (<em>"There is a new version of the pre-bundle…"</em>), wedging SSR rendering in a permanent
      re-optimize loop.
    </p>
    <p>So polyglot decides automatically:</p>
    <ul>
      <li><strong>Multiple locales</strong> → <code>--prebundle=false</code> (no shared mutable cache; everything serves cleanly).</li>
      <li><strong>One locale</strong> → prebundling stays on, for the faster start.</li>
    </ul>
    <div class="callout warn">
      This is not an option you set — it's derived from your selection. See it confirmed in the
      startup banner (<em>"Vite prebundling: off (multi-locale)"</em>).
    </div>

    <p>
      Next: make sure your <a routerLink="/angular-setup">Angular setup</a> declares the locales and
      serve configs polyglot expects.
    </p>
  `,
})
export class HowItWorksComponent {}
