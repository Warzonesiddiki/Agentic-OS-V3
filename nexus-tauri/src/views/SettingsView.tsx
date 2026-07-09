import { type ReactElement } from 'react';

/**
 * Settings view — placeholder route demonstrating code-splitting.
 * Wired to the OS settings store in a later phase.
 */
export default function SettingsView(): ReactElement {
  return (
    <section aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>
      <p>Settings panel loads here.</p>
    </section>
  );
}
