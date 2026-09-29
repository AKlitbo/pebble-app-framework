/**
 * One fetch round at a time, shared by every feature that fetches for the watch.
 *
 * A fetch answers later, and two answers can land in any order. The round number says which fetch
 * is the current one, so a late answer from an older round is dropped rather than sent to the watch
 * over a newer one. The in-flight flag holds off an unforced fetch while one runs, so the watch
 * asking again does not spend a provider call twice. A forced fetch, one a settings save asks for,
 * takes over the round that is running.
 */

/** Which round is current and whether it is running, read and updated in place by a feature. */
export interface RoundState {
  /** A round is fetching, or waiting on a retry. */
  inFlight: boolean;
  /** The current round's number. It moves on whenever a round starts, ends, or is shut out. */
  round: number;
}

/**
 * Makes the round state for one feature, with nothing running.
 *
 * @return A fresh round state.
 */
export function createRound(): RoundState {
  return { inFlight: false, round: 0 };
}

/**
 * Starts a round, or drops an unforced start while one is running.
 *
 * A forced start takes over the running round. The new number shuts out its late answers, and its
 * own close with them.
 *
 * @param state The round state to read and update in place.
 * @param force Whether to start even when a round is already running.
 * @return The new round's number, or null when the start was dropped.
 */
export function startRound(state: RoundState, force: boolean): number | null {
  if (state.inFlight && !force) {
    return null;
  }

  state.inFlight = true;

  return ++state.round;
}

/**
 * Whether a round is still the current one, so its answer is still worth acting on.
 *
 * @param state The round state to read.
 * @param round The number startRound gave the round.
 * @return True while nothing has taken over or ended the round.
 */
export function roundIsCurrent(state: RoundState, round: number): boolean {
  return round === state.round;
}

/**
 * Shuts out the running round without waiting for it, for a settings save that made its answer wrong.
 *
 * The round's answer, its retry, its watchdog, and its own close are all dropped, and the next
 * unforced start goes through.
 *
 * @param state The round state to update in place.
 */
export function shutOutRound(state: RoundState): void {
  state.round++;
  state.inFlight = false;
}

/**
 * Ends a round, once. A round that was taken over or already ended stays as it is.
 *
 * The number moves on again, so the ended round's watchdog or a straggling reply is shut out.
 *
 * @param state The round state to update in place.
 * @param round The number startRound gave the round.
 * @return True when this call ended the round, false when it was not the current one.
 */
export function finishRound(state: RoundState, round: number): boolean {
  if (round !== state.round) {
    return false;
  }

  shutOutRound(state);

  return true;
}

export default { createRound, startRound, roundIsCurrent, shutOutRound, finishRound };
