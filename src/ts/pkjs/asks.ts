/**
 * Who gets to fetch between the watch and the phone, shared by every feature that polls.
 *
 * The watch polls each feature on its own clock, and the phone runs a slow refresh of its own in case
 * the watch stops asking. Left alone the two fetch the same data twice. The watch's poll follows the
 * interval the wearer picked, so it leads, and the phone's slow tick only fetches when nothing asked
 * since the last one. A settings save forces its own refetch, and a watch ask that lands before it
 * runs is folded into it. A feature can also give its asks a gap, so an ask that lands just after a
 * fetch finished resends that reading rather than fetching it again.
 */

/**
 * The gap weather and the calendar keep after a finished fetch. The phone fetches as it comes up,
 * and the watch's own ask lands a moment after that round has finished, so without it every launch
 * fetches twice. A minute covers that and is short enough that a real poll never lands in it.
 */
export const ASK_GAP_MS = 60 * 1000;

/** Who has asked lately, read and updated in place by a feature's hooks. */
export interface FeatureAsks {
  /** The watch asked, or the phone came up, since the last slow tick. */
  sinceSlowTick: boolean;
  /** A setting was saved and its forced refetch has not run yet. */
  savePending: boolean;
  /** How long after a finished fetch an ask resends rather than fetches, 0 for no gap. */
  gapMs: number;
  /** When the last fetch finished with a reading to resend, or null before the first. */
  fetchedAtMs: number | null;
}

/**
 * Makes the ask state for one feature, with nothing asked yet.
 *
 * @param gapMs How long after a finished fetch an ask resends rather than fetches. Left out, there is no gap.
 * @return A fresh ask state.
 */
export function createAsks(gapMs = 0): FeatureAsks {
  return { sinceSlowTick: false, savePending: false, gapMs, fetchedAtMs: null };
}

/**
 * Decides whether a watch ask, or the phone coming up, should start a fetch.
 *
 * An ask that lands while a save's refetch is pending is folded into it, or the two would race and
 * fetch twice. An ask that lands inside the gap after a finished fetch has `resend` send that
 * reading again, since fetching it again would bring the same reading. Either way the ask counts
 * towards skipping the next slow tick.
 *
 * @param asks The ask state to read and update in place.
 * @param nowMs The time now, in ms since the epoch. Only read when the asks have a gap.
 * @param resend Sends the last reading again, for an ask inside the gap.
 * @return True when the ask should start a fetch.
 */
export function askShouldFetch(asks: FeatureAsks, nowMs = 0, resend?: () => void): boolean {
  asks.sinceSlowTick = true;

  if (asks.savePending) {
    return false;
  }

  // a clock that stepped back puts now before the fetch, which reads as outside the gap
  const sinceFetch = asks.fetchedAtMs === null ? -1 : nowMs - asks.fetchedAtMs;

  if (resend && sinceFetch >= 0 && sinceFetch < asks.gapMs) {
    resend();
    return false;
  }

  return true;
}

/**
 * Notes that a fetch finished with a reading, which opens the gap an ask resends inside. A fetch that
 * finishes while a save's refetch waits opens none.
 *
 * @param asks The ask state to update in place.
 * @param nowMs The time the fetch finished, in ms since the epoch.
 */
export function fetchFinished(asks: FeatureAsks, nowMs: number): void {
  // a round from before a save that lands while its refetch waits has the old reading, so it opens
  // no gap
  if (asks.savePending) {
    return;
  }

  asks.fetchedAtMs = nowMs;
}

/**
 * Decides whether a slow tick should start a fetch.
 *
 * A tick that follows one of the watch's asks would only fetch the same data again. The tick
 * fetches when nothing asked since the last one, such as a watch out of range. A save's refetch
 * that is still waiting to run owns the next fetch, so a tick that lands in that moment waits.
 *
 * @param asks The ask state to read and update in place.
 * @return True when the tick should start a fetch.
 */
export function slowTickShouldFetch(asks: FeatureAsks): boolean {
  const due = !asks.sinceSlowTick && !asks.savePending;

  asks.sinceSlowTick = false;

  return due;
}

/**
 * Runs a forced refetch once the settings page has had time to save, holding back watch asks until then.
 * It also closes the gap after the last fetch, since that reading is from before the save.
 *
 * @param asks The ask state to update in place.
 * @param delayMs How long to wait, normally the context's refetchDelayMs.
 * @param refetch The forced fetch to run.
 */
export function refetchAfterSave(asks: FeatureAsks, delayMs: number, refetch: () => void): void {
  asks.savePending = true;

  // the save makes the last reading out of date, so the gap closes and no ask resends it. a refetch
  // that brings a reading opens it again, and one that fails leaves the next ask to fetch
  asks.fetchedAtMs = null;

  setTimeout(() => {
    asks.savePending = false;
    asks.sinceSlowTick = true;
    refetch();
  }, delayMs);
}
