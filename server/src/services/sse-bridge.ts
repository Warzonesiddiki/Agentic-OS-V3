import { getMessageBus } from './message-bus.js';
import { broadcastSSE } from './sse-bus.js';

export function initializeSseBridge(): void {
  const bus = getMessageBus();
  // Listen to message events on the bus and forward them to SSE
  bus.on('message', (msg) => {
    broadcastSSE({
      type: msg.type,
      data: msg.payload,
      timestamp: msg.createdAt,
    });
  });
}
