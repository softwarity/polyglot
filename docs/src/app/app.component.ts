import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface DocLink {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly links: DocLink[] = [
    { path: '/', label: 'Getting started', icon: 'rocket_launch' },
    { path: '/how-it-works', label: 'How it works', icon: 'account_tree' },
    { path: '/angular-setup', label: 'Angular setup', icon: 'settings' },
    { path: '/cli-reference', label: 'CLI reference', icon: 'terminal' },
    { path: '/troubleshooting', label: 'Troubleshooting', icon: 'healing' },
  ];
}
