/** In-process event bus for the single self-hosted API process. */

export type BusEventType = 'record-ingested' | 'case-status' | 'case-panchnama';

export interface BusEvent {
  id: string;
  type: BusEventType;
  payload: Record<string, unknown>;
  at: string;
}

type Listener = (event: BusEvent) => void;
const listeners = new Set<Listener>();
let eventSequence = 0;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(type: BusEventType, payload: Record<string, unknown>): BusEvent {
  eventSequence += 1;
  const event: BusEvent = {
    id: `${Date.now().toString(36)}-${eventSequence.toString(36)}`,
    type,
    payload,
    at: new Date().toISOString(),
  };
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      listeners.delete(listener);
    }
  }
  return event;
}

export function subscriberCount(): number {
  return listeners.size;
}
