/**
 * Who gets to fetch between the watch and the phone, shared by every feature that polls.
 *
 * The watch polls each feature on its own clock, and the phone runs a slow refresh of its own in case
 * the watch stops asking. Left alone the two fetch the same data twice. The watch's poll follows the
 * interval the wearer picked, so it leads, and the phone's slow tick only fetches when nothing asked
 * since the last one. A settings save forces its own refetch, and a watch ask that lands before it
 * runs is folded into it.
 */

/** Who has asked lately, read and updated in place by a feature's hooks. */
export interface FeatureAsks {
  /** The watch asked, or the phone came up, since the last slow tick. */
  sinceSlowTick: boolean;
  /** A setting was saved and its forced refetch has not run yet. */
  savePending: boolean;
}

/**
 * Makes the ask state for one feature, with nothing asked yet.
 *
 * @return A fresh ask state.
 */
export function createAsks(): FeatureAsks {
  return { sinceSlowTick: false, savePending: false };
}

/**
 * Decides whether a watch ask, or the phone coming up, should start a fetch.
 *
 * An ask that lands while a save's refetch is pending is folded into it, or the two would race and
 * fetch twice. Either way the ask counts towards skipping the next slow tick.
 *
 * @param asks The ask state to read and update in place.
 * @return True when the ask should start a fetch.
 */
export function askShouldFetch(asks: FeatureAsks): boolean {
  asks.sinceSlowTick = true;

  return !asks.savePending;
}

/**
 * Decides whether a slow tick should start a fetch.
 *
 * A tick that follows one of the watch's asks would only fetch the same data again. The tick
 * fetches when nothing asked since the last one, such as a watch out of range.
 *
 * @param asks The ask state to read and update in place.
 * @return True when the tick should start a fetch.
 */
export function slowTickShouldFetch(asks: FeatureAsks): boolean {
  const due = !asks.sinceSlowTick;

  asks.sinceSlowTick = false;

  return due;
}

/**
 * Runs a forced refetch once the settings page has had time to save, holding back watch asks until then.
 *
 * @param asks The ask state to update in place.
 * @param delayMs How long to wait, normally the context's refetchDelayMs.
 * @param refetch The forced fetch to run.
 */
export function refetchAfterSave(asks: FeatureAsks, delayMs: number, refetch: () => void): void {
  asks.savePending = true;

  setTimeout(() => {
    asks.savePending = false;
    asks.sinceSlowTick = true;
    refetch();
  }, delayMs);
}
