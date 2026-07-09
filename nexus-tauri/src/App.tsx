import { type ReactElement } from 'react';
import { Router } from './router/Router';

export interface NavItem {
  path: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '#/', label: 'Home' },
  { path: '#/agents', label: 'Agents' },
  { path: '#/memory', label: 'Memory' },
  { path: '#/settings', label: 'Settings' },
];

/**
 * Root desktop shell layout: top navigation + the lazy-loaded router outlet.
 * The router itself wraps each view in an ErrorBoundary + Suspense.
 */
export default function App(): ReactElement {
  return (
    <div className="nexus-shell">
      <nav className="nexus-nav" aria-label="Primary">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <a href={item.path}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="nexus-content">
        <Router />
      </main>
    </div>
  );
}
