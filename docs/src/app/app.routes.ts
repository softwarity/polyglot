import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/getting-started.component').then((m) => m.GettingStartedComponent),
  },
  {
    path: 'how-it-works',
    loadComponent: () => import('./pages/how-it-works.component').then((m) => m.HowItWorksComponent),
  },
  {
    path: 'angular-setup',
    loadComponent: () => import('./pages/angular-setup.component').then((m) => m.AngularSetupComponent),
  },
  {
    path: 'cli-reference',
    loadComponent: () => import('./pages/cli-reference.component').then((m) => m.CliReferenceComponent),
  },
  {
    path: 'troubleshooting',
    loadComponent: () => import('./pages/troubleshooting.component').then((m) => m.TroubleshootingComponent),
  },
  { path: '**', redirectTo: '' },
];
