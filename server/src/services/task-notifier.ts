import { getPgClient, isSqlite } from '../db/client.js';
import { log } from '../lib/logging.js';

let listeners: ((taskId: string) => void)[] = [];
let pgListener: { unlisten(): Promise<void> } | null = null;

export function onTaskQueued(cb: (taskId: string) => void): () => void {
  listeners.push(cb);
  if (!isSqlite && !pgListener) {
    const pg = getPgClient();
    if (pg) {
      pg.listen('task_queued', (payload: string) => {
        for (const listener of listeners) {
          try {
            listener(payload);
          } catch (e) {
            log.error('task_queued_listener_error', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      })
        .then((listener: { unlisten(): Promise<void> }) => {
          pgListener = listener;
        })
        .catch((e: Error) => {
          log.error('postgres_listen_error', { error: e.message });
        });
    }
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0 && pgListener) {
      pgListener.unlisten().catch(() => {});
      pgListener = null;
    }
  };
}

export function notifyTaskQueued(taskId: string): void {
  if (isSqlite) {
    for (const listener of listeners) {
      try {
        listener(taskId);
      } catch (e) {
        log.error('task_queued_listener_error', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  } else {
    const pg = getPgClient();
    if (pg) {
      pg`NOTIFY task_queued, ${taskId}`.catch((e: Error) => {
        log.error('postgres_notify_error', { error: e.message });
      });
    }
  }
}
