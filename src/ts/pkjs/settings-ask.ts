/**
 * Asks the watch for its settings on launch, and asks again only when the watch turns the ask away.
 *
 * PebbleOS reports a face as running before the face's own init has opened AppMessage, and a
 * message that lands before then is turned away. The send queue gives up after three quick tries,
 * so a face that opens AppMessage late would lose the only ask of the session and never be restored.
 * An ask the watch takes is never sent again. The watch queues its reply before it acks, so a
 * second ask would only bring a second reply.
 */

import type { QueueSendFn } from './send-queue';

/** The wait between a refused ask and the next one, in ms. */
export const SETTINGS_ASK_RETRY_MS = 1000;

/** How many asks go out after the first one before the phone stops asking for the session. */
export const SETTINGS_ASK_RETRIES = 8;

/** The launch ask for the watch's settings. */
export interface SettingsAsk {
  /**
   * Queues the ask, and asks again after each refusal until the watch takes it or the asks run out.
   * A new run on every call.
   */
  start(dict: AppMessageDict): void;

  /** A settings reply landed. True for the first reply of the run, false for a repeat. */
  answered(): boolean;
}

/**
 * Builds the launch ask on top of the send queue.
 *
 * Each start is its own run. A refusal from an earlier run's ask is ignored, so a second ready
 * never doubles the asks that follow.
 *
 * @param queueSend The queue every send goes through.
 * @return The ask, ready to start on ready.
 */
export function createSettingsAsk(queueSend: QueueSendFn): SettingsAsk {
  // bumped on every start, so a callback from an earlier run does nothing
  let run = 0;
  let replied = false;
  let asksLeft = 0;

  /** Queues one ask for a run, and on a refusal waits a gap and asks again while asks are left. */
  function send(dict: AppMessageDict, thisRun: number): void {
    // an ack arms nothing. the watch queues its reply before it acks and retries that reply itself,
    // so a reply lost after all of its tries leaves the session unrestored until the next launch asks
    // again. waiting on the reply instead needs a timer, and a timer asks again after a reply that is
    // only slow, which brings a second reply on every slow launch
    queueSend(dict, undefined, () => {
      // the watch sends its reply before it acks the ask, so a reply can land and the queue still
      // report the ask as failed when the ack was lost. asking again then only brings another reply
      if (thisRun !== run || replied) {
        return;
      }

      if (asksLeft === 0) {
        console.log('settings: the watch turned away every ask for its settings');
        return;
      }

      asksLeft--;
      setTimeout(() => {
        if (thisRun === run && !replied) {
          send(dict, thisRun);
        }
      }, SETTINGS_ASK_RETRY_MS);
    });
  }

  return {
    start(dict: AppMessageDict): void {
      run++;
      replied = false;
      asksLeft = SETTINGS_ASK_RETRIES;
      send(dict, run);
    },

    answered(): boolean {
      if (replied) {
        return false;
      }

      replied = true;
      return true;
    },
  };
}

export default { createSettingsAsk, SETTINGS_ASK_RETRIES, SETTINGS_ASK_RETRY_MS };
