import { useState, type ReactElement } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackendStatusBanner } from './components/BackendStatusBanner';
import { Greet } from './components/Greet';
import './App.css';

export interface AppState {
  name: string;
}

export default function App(): ReactElement {
  const [name] = useState<string>('Nexus');

  return (
    <ErrorBoundary>
      <main className="container">
        <h1>Welcome to Nexus 2.0</h1>
        <BackendStatusBanner />
        <Greet name={name} />
      </main>
    </ErrorBoundary>
  );
}
