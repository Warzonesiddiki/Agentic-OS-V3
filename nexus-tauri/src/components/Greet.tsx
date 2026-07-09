import { useEffect, useId, useState, type ReactElement } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface GreetProps {
  /** Initial name used for the greeting. */
  name?: string;
}

/**
 * Typed call into the Rust `greet` command with explicit loading / error
 * states, demonstrating the hardened command bridge. Includes a labeled,
 * accessible input so the user can change the greeting target.
 */
export function Greet({ name = 'Nexus' }: GreetProps): ReactElement {
  const [input, setInput] = useState<string>(name);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<string>('greet', { name: input })
      .then((res) => {
        if (!cancelled) setMessage(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input]);

  if (loading) return <p className="nexus-greet nexus-greet--loading">Greeting…</p>;
  if (error) return <p className="nexus-greet nexus-greet--error">Error: {error}</p>;

  return (
    <div className="nexus-greet">
      <label htmlFor={inputId}>Name to greet</label>
      <input
        id={inputId}
        type="text"
        value={input}
        onChange={(e) => setInput(e.currentTarget.value)}
        aria-label="Name to greet"
      />
      <p>{message}</p>
    </div>
  );
}
