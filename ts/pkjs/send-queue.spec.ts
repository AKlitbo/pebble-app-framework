/**
 * Specs for the AppMessage send queue.
 *
 * PebbleKit JS drops a send that starts while another is in flight, so this queue is the only
 * thing keeping a cold boot's four concurrent sends from losing three of them. The transitions
 * worth pinning are the ones a reader cannot check by eye: that the queue holds the next send
 * until the current one settles, that a nack retries the same head rather than skipping it, that
 * a send nobody ever acks or nacks still frees the queue, and that a settled send cannot settle
 * twice. The deduped sender on top of it is pinned for the one transition that matters, a failed
 * send that has to go out again.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDedupedSender, createSendQueue, SEND_RETRIES, SEND_RETRY_MS, SEND_WATCHDOG_MS } from './send-queue';
import type { SendFn } from './send-queue';

/** A captured send, kept so a spec can ack or nack it whenever it likes. */
interface Call {
  dict: AppMessageDict;
  ok: () => void;
  fail: () => void;
}

/** A send that records each call and hands back the ack/nack so the spec drives the timing. */
function recordingSend(): { calls: Call[]; send: SendFn } {
  const calls: Call[] = [];
  const send: SendFn = (dict, onOk, onFail) => {
    calls.push({ dict: dict, ok: onOk, fail: onFail });
  };

  return { calls: calls, send: send };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createSendQueue', () => {
  /** The first send must go straight out, or every reading waits on a timer that never fires. */
  test('sends the first queued dict immediately', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });

    expect(calls).toHaveLength(1);
    expect(calls[0].dict).toEqual({ a: 1 });
  });

  /**
   * A dict the phone cannot encode throws out of the send. The throw escaped into the settings save,
   * so the features never heard about the save, and the queue sat blocked until the watchdog.
   */
  test('counts a send that throws as a failed one and keeps the throw inside', () => {
    let attempts = 0;
    const onFail = vi.fn();
    const queueSend = createSendQueue(() => {
      attempts++;
      throw new Error('unknown key');
    });

    queueSend({ a: 1 }, undefined, onFail);
    vi.advanceTimersByTime(SEND_RETRY_MS * SEND_RETRIES);

    expect(attempts).toBe(SEND_RETRIES);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  /**
   * The bug this queue exists for. Two sends racing at cold boot means PebbleKit drops the loser
   * with no retry, so the face sits blank until some later send happens to get through.
   */
  test('holds the second dict until the first one is acked', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    queueSend({ b: 2 });

    expect(calls).toHaveLength(1);

    calls[0].ok();

    expect(calls).toHaveLength(2);
    expect(calls[1].dict).toEqual({ b: 2 });
  });

  /** onOk is how the callers latch "the watch has this now", so it must fire on the ack. */
  test('calls onOk when the send is acked', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    const onOk = vi.fn();

    queueSend({ a: 1 }, onOk);
    calls[0].ok();

    expect(onOk).toHaveBeenCalledTimes(1);
  });

  /**
   * A callback is caller code, and one that threw skipped starting the next send, so everything
   * queued behind it waited on some unrelated send to come along.
   */
  test('starts the next send when a callback throws', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    queueSend({ a: 1 }, () => {
      throw new Error('caller bug');
    });
    queueSend({ b: 2 });

    calls[0].ok();

    expect(calls).toHaveLength(2);
    expect(calls[1].dict).toEqual({ b: 2 });
  });

  /** A nack usually just means a momentarily busy outbox, so the same dict must go again. */
  test('retries the same dict after a nack once the backoff has passed', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    calls[0].fail();

    expect(calls).toHaveLength(1);

    vi.advanceTimersByTime(SEND_RETRY_MS);

    expect(calls).toHaveLength(2);
    expect(calls[1].dict).toEqual({ a: 1 });
  });

  /** Retrying instantly would just lose the same race again, so the backoff has to be waited out. */
  test('does not retry before the backoff has elapsed', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    calls[0].fail();
    vi.advanceTimersByTime(SEND_RETRY_MS - 1);

    expect(calls).toHaveLength(1);
  });

  /**
   * A send queued while the head is sitting out its backoff must not take the slot. It would put
   * the nacked dict straight back at the outbox that just refused it and the wait would buy nothing.
   */
  test('holds the queue through the backoff when another send is queued in the gap', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    calls[0].fail();
    queueSend({ b: 2 });

    expect(calls).toHaveLength(1);

    vi.advanceTimersByTime(SEND_RETRY_MS);

    expect(calls).toHaveLength(2);
    expect(calls[1].dict).toEqual({ a: 1 });
  });

  /** Without a cap on the retries one unsendable dict would wedge the queue forever. */
  test('gives up on a dict after the retry cap and calls onFail', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    const onFail = vi.fn();

    queueSend({ a: 1 }, undefined, onFail);
    for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
      calls[calls.length - 1].fail();
      vi.advanceTimersByTime(SEND_RETRY_MS);
    }

    expect(calls).toHaveLength(SEND_RETRIES);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  /** A dropped dict must not take the rest of the queue with it, or one bad send blanks the face. */
  test('moves on to the next dict after giving up on a stuck one', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    queueSend({ b: 2 });
    for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
      calls[calls.length - 1].fail();
      vi.advanceTimersByTime(SEND_RETRY_MS);
    }

    expect(calls[calls.length - 1].dict).toEqual({ b: 2 });
  });

  /**
   * The queue's worst failure: PebbleKit calls back neither the ack nor the nack, so without the
   * watchdog the in-flight flag stays set and nothing is ever sent again for the life of the app.
   */
  test('frees the queue with the watchdog when a send is never acked or nacked', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    vi.advanceTimersByTime(SEND_WATCHDOG_MS);
    vi.advanceTimersByTime(SEND_RETRY_MS);

    expect(calls).toHaveLength(2);
    expect(calls[1].dict).toEqual({ a: 1 });
  });

  /** The watchdog counts as a try, so a silent send must still be given up on rather than looping. */
  test('gives up on a silent send after the retry cap', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    const onFail = vi.fn();

    queueSend({ a: 1 }, undefined, onFail);
    for (let attempt = 0; attempt < SEND_RETRIES; attempt++) {
      vi.advanceTimersByTime(SEND_WATCHDOG_MS);
      vi.advanceTimersByTime(SEND_RETRY_MS);
    }

    expect(calls).toHaveLength(SEND_RETRIES);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  /** A late ack arriving after the watchdog already fired would shift a dict that is no longer the head. */
  test('ignores an ack that arrives after the watchdog gave up on the send', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    const onOk = vi.fn();

    queueSend({ a: 1 }, onOk);
    vi.advanceTimersByTime(SEND_WATCHDOG_MS);
    calls[0].ok();

    expect(onOk).not.toHaveBeenCalled();
  });

  /** A doubled ack would shift the queue twice and silently swallow the send behind it. */
  test('ignores a second ack for the same send', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);
    const onOk = vi.fn();

    queueSend({ a: 1 }, onOk);
    queueSend({ b: 2 });
    calls[0].ok();
    calls[0].ok();

    expect(onOk).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  /** An ack followed by a nack must not re-queue a send the watch already has. */
  test('ignores a nack that follows an ack for the same send', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    calls[0].ok();
    calls[0].fail();
    vi.advanceTimersByTime(SEND_RETRY_MS);

    expect(calls).toHaveLength(1);
  });

  /** The watchdog must be cleared on a clean ack, or it would later fail a send that already succeeded. */
  test('does not fire the watchdog for a send that was already acked', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ a: 1 });
    calls[0].ok();
    vi.advanceTimersByTime(SEND_WATCHDOG_MS + SEND_RETRY_MS);

    expect(calls).toHaveLength(1);
  });

  /** A cold boot queues four sends at once, and all four have to reach the watch in order. */
  test('drains a burst of sends one at a time and in order', () => {
    const { calls, send } = recordingSend();
    const queueSend = createSendQueue(send);

    queueSend({ settings: 1 });
    queueSend({ weather: 1 });
    queueSend({ stocks: 1 });
    queueSend({ calendar: 1 });
    for (let index = 0; index < 4; index++) {
      expect(calls).toHaveLength(index + 1);
      calls[index].ok();
    }

    expect(calls.map((call) => call.dict)).toEqual([
      { settings: 1 },
      { weather: 1 },
      { stocks: 1 },
      { calendar: 1 },
    ]);
  });

  /** Two faces must not share a slot, or one face's send would block the other's. */
  test('keeps separate queues independent', () => {
    const first = recordingSend();
    const second = recordingSend();
    const queueFirst = createSendQueue(first.send);
    const queueSecond = createSendQueue(second.send);

    queueFirst({ a: 1 });
    queueSecond({ b: 2 });

    expect(first.calls).toHaveLength(1);
    expect(second.calls).toHaveLength(1);
  });
});

describe('createDedupedSender', () => {
  /** A dedupe sender that records what it was handed, so a spec can fail a send after the fact. */
  function recordingDedupe() {
    const fails: Array<() => void> = [];
    const sent: AppMessageDict[] = [];
    const queueSend = (dict: AppMessageDict, _onOk?: () => void, onFail?: () => void) => {
      sent.push(dict);
      fails.push(onFail || (() => {}));
    };
    const sender = createDedupedSender(queueSend, 'Test');

    return { fails, sent, sender };
  }

  /** An unchanged strip would otherwise cost the watch a BLE wake on every refresh. */
  test('skips a push with the same contents as the last one', () => {
    const { sent, sender } = recordingDedupe();

    sender.push({ STRIP: [1, 2, 3] });
    sender.push({ STRIP: [1, 2, 3] });

    expect(sent).toHaveLength(1);
  });

  /**
   * A send that failed never reached the watch. Holding onto it would skip the retry with the
   * same strip, and the face stays blank until the values happen to move.
   */
  test('sends the same strip again after the last send failed', () => {
    const { fails, sent, sender } = recordingDedupe();

    sender.push({ STRIP: [1, 2, 3] });
    fails[0]();
    sender.push({ STRIP: [1, 2, 3] });

    expect(sent).toHaveLength(2);
  });
});
