/**
 * Serializes the watch's AppMessage sends so they never collide.
 *
 * PebbleKit JS only allows one AppMessage in flight, so concurrent sends collide and the loser is
 * silently dropped. At cold boot the settings round-trip, weather, stocks, and calendar all fire
 * at once, so a fetched reading would drop with no retry and leave the face blank until a lone
 * later send (like a settings change) got through. Every send goes through one queue: one at a
 * time, each retried a few times on a nack before it is given up.
 */

/** How a queued dict reaches the watch. Injected so the specs can drive the ack and the nack. */
export type SendFn = (dict: AppMessageDict, onOk: () => void, onFail: () => void) => void;

/** What queueSend looks like at the call site. */
export type QueueSendFn = (dict: AppMessageDict, onOk?: () => void, onFail?: () => void) => void;

/** How many times a nacked send is retried before it is dropped and the queue moves on. */
export const SEND_RETRIES = 3;

/** How long to back off after a nack before retrying the same head. */
export const SEND_RETRY_MS = 250;

/** How long to wait for an ack or a nack before counting the send as failed. */
export const SEND_WATCHDOG_MS = 8000;

/** A send waiting its turn, with the retry count it has used up so far. */
interface QueueItem {
  dict: AppMessageDict;
  onOk?: () => void;
  onFail?: () => void;
  tries: number;
}

/**
 * Builds a queueSend that pushes through `send` one message at a time.
 *
 * Each queue is independent, so a face gets one and every send it makes shares that single slot.
 *
 * @param send How a queued dict actually reaches the watch, and how the ack or nack comes back.
 * @return A queueSend function. Each call queues one message, calling onOk or onFail once it settles.
 */
export function createSendQueue(send: SendFn): QueueSendFn {
  const items: QueueItem[] = [];
  let sending = false;

  /** Sends the next queued item, if the queue is free and something is waiting. */
  function pump(): void {
    if (sending || items.length === 0) {
      return;
    }
    sending = true;
    const item = items[0];

    // resolve each send exactly once. a lost ack/nack (neither callback ever fires) would otherwise
    // leave sending true forever and wedge the whole queue, so a watchdog counts as a failure
    let settled = false;
    /**
     * Settles the send in flight, whichever way it finishes.
     *
     * A success shifts the item off the queue and starts the next one. A failure retries the
     * same item until it runs out of tries, then drops it and moves on.
     */
    const settle = (ok: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(watchdog);

      if (ok) {
        sending = false;
        items.shift();
        if (item.onOk) {
          item.onOk();
        }
        pump();
        return;
      }

      // a nack usually just means the outbox was momentarily busy, so back off and retry the same
      // head a few times before dropping it and moving on so one stuck send can't wedge the queue
      item.tries++;
      if (item.tries >= SEND_RETRIES) {
        sending = false;
        items.shift();
        if (item.onFail) {
          item.onFail();
        }
        pump();
        return;
      }

      setTimeout(() => {
        sending = false;
        pump();
      }, SEND_RETRY_MS);
    };

    const watchdog = setTimeout(() => settle(false), SEND_WATCHDOG_MS);
    send(item.dict, () => settle(true), () => settle(false));
  }

  /** Adds one message to the queue and kicks off sending if nothing else is in flight. */
  return function queueSend(dict, onOk, onFail) {
    items.push({ dict: dict, onOk: onOk, onFail: onFail, tries: 0 });
    pump();
  };
}

/** Sends one kind of payload to the watch, skipping a send the watch already holds. */
export interface DedupedSender<T> {
  /** Sends the payload, unless it matches the one the watch took last. */
  push(value: T): void;

  /** Forgets what the watch holds, so the next push goes out whatever it carries. */
  forget(): void;
}

/**
 * Wraps a queueSend so the same payload is not sent twice in a row.
 *
 * Every push costs a BLE wake whether or not the reading moved, so the payload the watch took is
 * kept and an identical one is dropped. The half worth spelling out is the failure: a send that
 * nacked its way to the retry cap never reached the watch, so what was kept is thrown away and
 * the next push goes out again. Recording it on the way in instead would leave the face blank
 * until the values happened to move.
 *
 * @param queueSend The queue every send goes through.
 * @param build Turns the payload into the dict for the watch.
 * @param same Whether two payloads are the same reading. Defaults to identity.
 * @param label What to call this sender in the log.
 * @return The sender, holding what the watch last took.
 */
export function createDedupedSender<T>(
  queueSend: QueueSendFn,
  build: (value: T) => AppMessageDict,
  same: (left: T, right: T) => boolean,
  label: string
): DedupedSender<T> {
  let held: T | null = null;

  return {
    push(value: T): void {
      if (held !== null && same(value, held)) {
        console.log(`${label}: unchanged, skipping send`);
        return;
      }

      held = value;

      queueSend(
        build(value),
        () => {
          console.log(`${label}: sent to Pebble`);
        },
        () => {
          held = null;
          console.error(`${label}: send failed`);
        }
      );
    },

    forget(): void {
      held = null;
    },
  };
}

export default { createSendQueue, createDedupedSender, SEND_RETRIES, SEND_RETRY_MS, SEND_WATCHDOG_MS };
