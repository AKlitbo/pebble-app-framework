/**
 * A stand in for the `Pebble` global PebbleKit JS hands the phone code.
 *
 * It keeps every listener registered for an event, the way the real one does, so a spec that
 * started a second app by mistake sees both answer rather than the last one only. Every send to
 * the watch is recorded. By default the watch acks it straight away, and a spec can have it
 * refuse each send or hold it until the spec settles it.
 *
 * It also carries the plugin calls, `enumeratePlugins` and `subscribeToSource`, which list what
 * the spec puts in `plugins` and record every subscription for the spec to push updates and errors
 * through. A spec for a phone without plugins passes `{ plugins: false }` to leave both off.
 */

import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { resetQuickRetryTick } from '../plugin-sources/subscription';

type Listener = (event?: unknown) => void;

/** A send waiting while the fake holds, with its two ways to settle. */
export interface HeldSend {
  dict: Record<string, unknown>;

  /** The watch takes it. */
  ok(): void;

  /** The watch turns it away. */
  fail(): void;
}

/** What a face hands `subscribeToSource`, the fields the real bridge reads. */
export interface SourceRequest {
  category?: string;
  item?: string;
  plugin?: string;
  properties?: string[];
  iconPixelSize?: { w: number; h: number };
  onData?: (envelope: unknown) => void;
  onError?: (error: unknown) => void;
}

/** One subscription the face made, with the handles a spec drives it through. */
export interface FakeSourceSubscription {
  /** What the face asked for. */
  request: SourceRequest;

  /** Whether the face has called unsubscribe on it. */
  ended: boolean;

  /** Hands the face an update, as the phone does when the plugin sends one. Nothing arrives once ended. */
  push(envelope: unknown): void;

  /** Hands the face an error, such as `{ code: 'PERMISSION_DENIED', message: '...' }`. Nothing arrives once ended. */
  fail(error: unknown): void;
}

/** The options a spec can start the fake with. */
export interface FakePebbleOptions {
  /** Whether the phone has the plugin calls at all. On unless a spec says otherwise. */
  plugins?: boolean;
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

  /** What `enumeratePlugins` lists. Empty until the spec fills it. */
  plugins: unknown[];

  /** The fake's `enumeratePlugins`, on the global unless plugins are off. A spec can make it throw. */
  enumeratePlugins: Mock<() => unknown>;

  /** The fake's `subscribeToSource`, on the global unless plugins are off. A spec can make it throw. */
  subscribeToSource: Mock<(request: SourceRequest) => { unsubscribe(): void }>;

  /** Every subscription the face made, oldest first, ended ones included. */
  subscriptions: FakeSourceSubscription[];

  /** The subscriptions the face has not ended. */
  live(): FakeSourceSubscription[];

  /** Runs every listener registered for an event, as PebbleKit JS does when the event lands. */
  fire(type: string, event?: unknown): void;

  /**
   * Takes the global away again, and stops the plugin subscriptions' shared quick retry, so a
   * subscription a spec left idle cannot retry against the next spec's phone.
   */
  restore(): void;
}

/**
 * Runs a face's callback the way the real bridge does, which logs a throw rather than passing it
 * back to the phone.
 */
function callFace(label: string, callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch (error) {
    console.error(`fake Pebble: error in source ${label} callback`, error);
  }
}

/**
 * Puts a fake `Pebble` on the global object.
 *
 * @param options Whether the phone has the plugin calls. They are on unless `plugins` is false.
 * @return The fake, ready for a spec to fire events through and read the sends off.
 */
export function withFakePebble(options: FakePebbleOptions = {}): FakePebble {
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

  // the real bridge parses a fresh copy of the list on every call, so a face that changes what it
  // got back never changes what the next call lists
  const enumeratePlugins = vi.fn((): unknown => JSON.parse(JSON.stringify(fake.plugins)));

  const subscribeToSource = vi.fn((request: SourceRequest) => {
    // the real bridge turns away a request with no category or item by throwing
    if (!request || typeof request !== 'object' || !request.category || !request.item) {
      throw new Error('Pebble.subscribeToSource: category and item required');
    }

    const subscription: FakeSourceSubscription = {
      request,
      ended: false,
      push(envelope: unknown) {
        if (!subscription.ended) {
          callFace('onData', () => request.onData?.(envelope));
        }
      },
      fail(error: unknown) {
        if (!subscription.ended) {
          callFace('onError', () => request.onError?.(error));
        }
      },
    };

    fake.subscriptions.push(subscription);

    return {
      unsubscribe() {
        subscription.ended = true;
      },
    };
  });

  const fake: FakePebble = {
    sendAppMessage,
    answer: 'ack',
    held: [],
    delivered: [],
    plugins: [],
    enumeratePlugins,
    subscribeToSource,
    subscriptions: [],
    live() {
      return fake.subscriptions.filter((subscription) => !subscription.ended);
    },
    fire(type: string, event?: unknown) {
      (listeners[type] || []).forEach((handler) => handler(event));
    },
    restore() {
      delete host.Pebble;
      resetQuickRetryTick();
    },
  };

  const bridge: Record<string, unknown> = {
    addEventListener: (type: string, handler: Listener) => {
      listeners[type] = [...(listeners[type] || []), handler];
    },
    sendAppMessage,
    openURL: () => {},
  };

  if (options.plugins !== false) {
    bridge.enumeratePlugins = enumeratePlugins;
    bridge.subscribeToSource = subscribeToSource;
  }

  host.Pebble = bridge;

  return fake;
}
