import { type ReactElement } from 'react';
import { BackendStatusBanner } from '../components/BackendStatusBanner';
import { Greet } from '../components/Greet';

/**
 * Home view — the desktop shell landing page. Loaded lazily by the router.
 */
export default function HomeView(): ReactElement {
  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">Nexus 2.0 Desktop</h1>
      <BackendStatusBanner />
      <Greet name="Nexus" />
    </section>
  );
}
