import { type ReactElement } from 'react';

/**
 * Agents view — placeholder route demonstrating code-splitting.
 * Wired to the backend agent tree in a later phase.
 */
export default function AgentsView(): ReactElement {
  return (
    <section aria-labelledby="agents-heading">
      <h1 id="agents-heading">Agents</h1>
      <p>Agent roster loads here.</p>
    </section>
  );
}
