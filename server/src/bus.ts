/**
 * Parinaam API — in-process event bus (v2 phase D). Feeds GET /api/v1/stream (SSE)
 * so the separate web repo can render live ingest/review activity without polling.
 */

export interface BusEvent {
  type: 'record-ingested' | 'case-status';
  payload: Record<string, unknown>;
  at: string;
}

type Listener = (e: BusEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function publish(type: BusEvent['type'], payload: Record<string, unknown>): void {
  const e: BusEvent = { type, payload, at: new Date().toISOString() };
  for (const l of [...listeners]) {
    try {
      l(e);
    } catch {
      listeners.delete(l);
    }
  }
}
