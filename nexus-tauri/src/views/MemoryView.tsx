import { type ReactElement } from 'react';

/**
 * Memory view — placeholder route demonstrating code-splitting.
 * Wired to the recall pipeline in a later phase.
 */
export default function MemoryView(): ReactElement {
  return (
    <section aria-labelledby="memory-heading">
      <h1 id="memory-heading">Memory</h1>
      <p>Memory explorer loads here.</p>
    </section>
  );
}
