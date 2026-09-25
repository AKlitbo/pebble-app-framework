/**
 * A stand in for the `Pebble` global PebbleKit JS hands the phone code.
 *
 * It keeps every listener registered for an event, the way the real one does, so a spec that
 * started a second app by mistake sees both answer rather than the last one only. Every send to
 * the watch is acked straight away and recorded.
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';

type Listener = (event?: unknown) => void;

/** The installed fake, with the handles a spec drives it through. */
export interface FakePebble {
  /** Every dict sent to the watch, acked as it goes. */
  sendAppMessage: Mock<(dict: Record<string, unknown>, onOk?: () => void) => void>;

  /** Runs every listener registered for an event, as PebbleKit JS does when the event lands. */
  fire(type: string, event?: unknown): void;

  /** Takes the global away again. */
  restore(): void;
}

/**
 * Puts a fake `Pebble` on the global object.
 *
 * @return The fake, ready for a spec to fire events through and read the sends off.
 */
export function withFakePebble(): FakePebble {
  const host = globalThis as unknown as Record<string, unknown>;
  const listeners: Record<string, Listener[]> = {};
  const sendAppMessage = vi.fn((_dict: Record<string, unknown>, onOk?: () => void) => onOk?.());

  host.Pebble = {
    addEventListener: (type: string, handler: Listener) => {
      listeners[type] = [...(listeners[type] || []), handler];
    },
    sendAppMessage,
    openURL: () => {},
  };

  return {
    sendAppMessage,
    fire(type: string, event?: unknown) {
      (listeners[type] || []).forEach((handler) => handler(event));
    },
    restore() {
      delete host.Pebble;
    },
  };
}
