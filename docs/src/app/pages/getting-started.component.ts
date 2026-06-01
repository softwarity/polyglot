import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CodeComponent } from '../code/code.component';

@Component({
  selector: 'app-getting-started',
  imports: [CodeComponent, RouterLink],
  styles: [
    `
      .features {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px;
        margin: 0 0 28px 0;
      }
      .feature-card {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px 16px;
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        text-decoration: none;
        transition: all 0.15s;
      }
      .feature-card:hover {
        border-color: var(--accent-purple);
        background-color: rgba(163, 113, 247, 0.1);
        text-decoration: none;
        transform: translateY(-1px);
      }
      .feature-icon {
        font-size: 1.3rem;
        line-height: 1;
      }
      .feature-title {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.95rem;
      }
      .feature-desc {
        color: var(--text-secondary);
        font-size: 0.85rem;
        line-height: 1.45;
      }
    `,
  ],
  template: `
    <h2>Getting started</h2>

    <p>
      <strong>&#64;softwarity/polyglot</strong> serves <strong>every locale</strong> of an Angular
      i18n app at once, behind a <strong>single dev port</strong>. It reads your
      <code>angular.json</code>, spawns one <code>ng serve</code> per locale, and proxies each under
      its <code>subPath</code> — so your dev URL looks exactly like the deployed, localized site
      (<code>/en/</code>, <code>/fr/</code>, <code>/vi/</code>…) instead of one locale at a time.
    </p>

    <div class="callout">
      <strong>Development only.</strong> In production you don't run polyglot. Angular's
      <code>ng build</code> emits one <strong>static, localized app per locale</strong> — the site you
      actually deploy (to a CDN, GitHub Pages, any static host), where the path picks the language.
      polyglot simply <strong>reproduces that multi-locale URL shape at dev time</strong>, so what you
      see with <code>ng serve</code> matches what you ship. It is not a production server.
    </div>

    <div class="features">
      <a class="feature-card" routerLink="/how-it-works">
        <span class="feature-icon">🧭</span>
        <span class="feature-title">How it works</span>
        <span class="feature-desc">One proxy, one <code>ng serve</code> per locale, routed by subPath.</span>
      </a>
      <a class="feature-card" routerLink="/angular-setup">
        <span class="feature-icon">⚙️</span>
        <span class="feature-title">Angular setup</span>
        <span class="feature-desc">The i18n, build and serve configs polyglot reads.</span>
      </a>
      <a class="feature-card" routerLink="/cli-reference">
        <span class="feature-icon">⌨️</span>
        <span class="feature-title">CLI reference</span>
        <span class="feature-desc">Commands and options — all overridable.</span>
      </a>
      <a class="feature-card" routerLink="/troubleshooting">
        <span class="feature-icon">🩹</span>
        <span class="feature-title">Troubleshooting</span>
        <span class="feature-desc">Prebundle loop, ports, LAN, missing serve config.</span>
      </a>
    </div>

    <h3>1. Install</h3>
    <p>Add it as a dev dependency in your Angular project:</p>
    <app-code lang="bash">npm i -D &#64;softwarity/polyglot</app-code>

    <h3>2. Add a script (optional)</h3>
    <p>
      As a convenience, run <code>init</code> once. It writes a ready-to-run
      <code>start:i18n</code> script to your <code>package.json</code>, with the default options
      spelled out so you can see and tweak them:
    </p>
    <app-code lang="bash">npx polyglot init</app-code>
    <app-code lang="json">// package.json
"scripts": &#123;
  "start:i18n": "polyglot --config=./angular.json --port=4200"
&#125;</app-code>

    <div class="callout">
      <strong><code>init</code> is entirely optional.</strong> It only edits <code>package.json</code>
      for you — it never overwrites an existing script, and polyglot writes <em>no</em> selection or
      state file to your repo. You can skip it and add the script by hand under any name you like.
    </div>

    <p>
      In fact, a localized app usually carries one serve script per locale. You can
      <strong>replace them all with a single <code>start</code></strong> that runs polyglot — pick the
      locales interactively each time instead of maintaining N scripts:
    </p>
    <app-code lang="json">// before — one script per locale
"scripts": &#123;
  "start": "ng serve",
  "start:en": "ng serve --configuration=en",
  "start:fr": "ng serve --configuration=fr",
  "start:vi": "ng serve --configuration=vi"
&#125;

// after — one script for all of them
"scripts": &#123;
  "start": "polyglot"
&#125;</app-code>
    <p>
      With no arguments, <code>polyglot</code> uses <code>./angular.json</code> and port
      <code>4200</code> — so plain <code>npm start</code> just works.
    </p>

    <h3>3. Run it</h3>
    <app-code lang="bash">npm run start:i18n</app-code>
    <p>
      polyglot reads your locales from <code>angular.json</code> and asks which ones to start — pick a
      few, all, or quit:
    </p>
    <app-code lang="text">Project: my-app — source locale: en — baseHref: /

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
▸ Fallback locale: en</app-code>

    <p>
      Open <code>http://localhost:4200/</code> — any unknown path redirects to your source locale.
      That's it. Read <a routerLink="/how-it-works">how it works</a> next, or jump to the
      <a routerLink="/cli-reference">CLI reference</a>.
    </p>
  `,
})
export class GettingStartedComponent {}
