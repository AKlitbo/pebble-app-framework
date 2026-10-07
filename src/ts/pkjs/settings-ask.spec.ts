/**
 * Specs for the launch ask for the watch's settings.
 *
 * PebbleOS turns away a message that lands before the face has opened AppMessage, and the send
 * queue gives up after three quick tries. A face that opens AppMessage late in its init lost the one
 * ask sent on ready, so the settings restore never ran that session and a factory reset watch sat on
 * its defaults. This is what asks again, and only on a refusal, since the watch queues its reply
 * before it acks and a second ask after an ack only brings a second reply. The transitions worth
 * pinning are the retry on a refusal, the silence after an ack or a reply, the bound, and a second
 * start beginning a run of its own.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSettingsAsk, SETTINGS_ASK_RETRIES, SETTINGS_ASK_RETRY_MS } from './settings-ask';
import type { QueueSendFn } from './send-queue';

const ASK = { SETTINGS_REQUEST: 2 };

/** A queued ask, kept so a spec can have the queue report it taken or turned away when it likes. */
interface Sent {
  dict: AppMessageDict;
  ok: () => void;
  fail: () => void;
}

/** A queue that records each send and hands back its ack and refusal, so the spec drives the timing. */
function recordingQueue(): { sends: Sent[]; queueSend: QueueSendFn } {
  const sends: Sent[] = [];
  const queueSend: QueueSendFn = (dict, onOk, onFail) => {
    sends.push({ dict: dict, ok: () => onOk?.(), fail: () => onFail?.() });
  };

  return { sends: sends, queueSend: queueSend };
}

/** Turns away the newest ask, then waits the gap so the next one can go. */
function refuseNewest(sends: Sent[]): void {
  sends[sends.length - 1].fail();
  vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createSettingsAsk', () => {
  /** The first ask has to go out on ready, or a watch that is already listening waits for nothing. */
  test('sends the ask straight away', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    expect(sends.map((sent) => sent.dict)).toEqual([ASK]);
  });

  /**
   * A face that opens AppMessage late turns the ready ask away, and without a second ask the restore
   * never runs that session.
   */
  test('asks again a gap after the watch turned the ask away', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    sends[0].fail();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);

    expect(sends).toHaveLength(2);
  });

  /**
   * Without the gap the next ask follows the refusal at once, and nine rounds of three refused tries
   * are over before the face has opened.
   */
  test('waits the whole gap before asking again', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    sends[0].fail();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS - 1);

    expect(sends).toHaveLength(1);
  });

  /**
   * The watch acks after queuing its reply, so a second ask only brings a second reply and a second
   * restore.
   */
  test('asks nothing more after the watch took the ask', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    sends[0].ok();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS * 10);

    expect(sends).toHaveLength(1);
  });

  /**
   * The watch sends its reply before it acks, so the reply can land and the queue still report that
   * ask as failed when the ack was lost. Asking again then only brings another reply.
   */
  test('stops asking once the watch has replied', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    refuseNewest(sends);
    ask.answered();

    sends[1].fail();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS * 10);

    expect(sends).toHaveLength(2);
  });

  /**
   * A reply that lands during the gap means the watch took an ask the queue gave up on, so the ask
   * waiting out the gap would only bring a second reply.
   */
  test('sends nothing after the gap when the watch replied during it', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    sends[0].fail();

    ask.answered();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);

    expect(sends).toHaveLength(1);
  });

  /**
   * A watch that refuses every ask must not be asked for the rest of the session. Each send is
   * refused once, since the real queue settles a send once.
   */
  test('gives up after its bound', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    for (let round = 0; round < SETTINGS_ASK_RETRIES + 1; round++) {
      refuseNewest(sends);
    }

    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS * 10);

    expect(sends).toHaveLength(SETTINGS_ASK_RETRIES + 1);
  });

  /** A watch that never took an ask is worth one line in the log, so a missing restore can be traced. */
  test('logs once when the last ask is turned away too', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    for (let round = 0; round < SETTINGS_ASK_RETRIES + 1; round++) {
      refuseNewest(sends);
    }

    expect(log).toHaveBeenCalledTimes(1);
  });

  /**
   * A second reply after a seed would make the phone restore the watch with the settings it just
   * took from it.
   */
  test('takes only the first reply of a run', () => {
    const { queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    ask.answered();

    const result = ask.answered();

    expect(result).toBe(false);
  });

  /**
   * A second ready is a new session for the watch too, and a reply counted as a repeat would leave a
   * reset watch unrestored.
   */
  test('takes a reply again after a new start', () => {
    const { queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    ask.answered();
    ask.start(ASK);

    const result = ask.answered();

    expect(result).toBe(true);
  });

  /**
   * A second ready sends its own ask, and if the first run's ask asked again as well, every ask from
   * then on would be doubled.
   */
  test('leaves a refusal from an older run alone after a new start', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    ask.start(ASK);

    sends[0].fail();
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);

    expect(sends).toHaveLength(2);
  });

  /**
   * A second ready inside the gap after a refusal sends its own ask, and the older run's ask going
   * out as well once the gap ends would double them.
   */
  test('sends nothing for an older run when its gap ends after a new start', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);
    sends[0].fail();

    ask.start(ASK);
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);

    expect(sends).toHaveLength(2);
  });

  /** A watch that relaunched needs the whole run of asks rather than what the last run left. */
  test('starts a fresh count of asks on a second start', () => {
    const { sends, queueSend } = recordingQueue();
    const ask = createSettingsAsk(queueSend);

    ask.start(ASK);

    for (let round = 0; round < SETTINGS_ASK_RETRIES + 1; round++) {
      refuseNewest(sends);
    }

    ask.start(ASK);

    refuseNewest(sends);

    expect(sends).toHaveLength(SETTINGS_ASK_RETRIES + 3);
  });
});
