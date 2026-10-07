/**
 * A stand in for the `Pebble` global PebbleKit JS hands the phone code.
 *
 * It keeps every listener registered for an event, the way the real one does, so a spec that
 * started a second app by mistake sees both answer rather than the last one only. Every send to
 * the watch is recorded. By default the watch acks it straight away, and a spec can have it
 * refuse each send or hold it until the spec settles it.
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';

type Listener = (event?: unknown) => void;

/** A send waiting while the fake holds, with its two ways to settle. */
export interface HeldSend {
  dict: Record<string, unknown>;

  /** The watch takes it. */
  ok(): void;

  /** The watch turns it away. */
  fail(): void;
}

/** The installed fake, with the handles a spec drives it through. */
export interface FakePebble {
  /** Every dict sent to the watch, each answered the way `answer` says. */
  sendAppMessage: Mock<(dict: Record<string, unknown>, onOk?: () => void, onFail?: () => void) => void>;

  /** How each send is answered. Acked straight away, refused straight away, or held for the spec. */
  answer: 'ack' | 'nack' | 'hold';

  /** The sends waiting while answer is 'hold', oldest first. */
  held: HeldSend[];

  /** Every dict the fake acked, which is what the watch took. A refused try is not in here. */
  delivered: Record<string, unknown>[];

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

  const sendAppMessage = vi.fn((dict: Record<string, unknown>, onOk?: () => void, onFail?: () => void) => {
    const take = () => {
      fake.delivered.push(dict);
      onOk?.();
    };

    if (fake.answer === 'nack') {
      onFail?.();
    } else if (fake.answer === 'hold') {
      fake.held.push({ dict: dict, ok: take, fail: () => onFail?.() });
    } else {
      take();
    }
  });

  const fake: FakePebble = {
    sendAppMessage,
    answer: 'ack',
    held: [],
    delivered: [],
    fire(type: string, event?: unknown) {
      (listeners[type] || []).forEach((handler) => handler(event));
    },
    restore() {
      delete host.Pebble;
    },
  };

  host.Pebble = {
    addEventListener: (type: string, handler: Listener) => {
      listeners[type] = [...(listeners[type] || []), handler];
    },
    sendAppMessage,
    openURL: () => {},
  };

  return fake;
}
