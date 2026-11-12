/**
 * The calls sent to each metered stock provider, and how many more its free plan has room for.
 *
 * Every call is stamped as it goes out and saved at once, so a round the phone kills partway through
 * still counts what it sent, and a round that never sent a call counts nothing. The counting itself
 * is the shared ledger in `ts/quota/ledger.ts`. What sits here is each stock provider's plan, read
 * from `FREE_PLANS`: Twelve Data by the clock minute and the UTC day, Alpha Vantage over the last 24
 * hours, since when its day starts again is not published.
 */

import { allowance as planAllowance, keepStamps, keyPrint, planFor, readStamps, saveStamps } from '../quota/ledger';
import type { Allowance, LedgerStorage, QuotaPlan, Stamp } from '../quota/ledger';
import { FREE_PLANS } from './limits';

export { keyPrint };
export type { Allowance, LedgerStorage };

/**
 * Alpha Vantage's free key allows 25 calls a day. A routine fetch stops at 20, which leaves the last
 * 5 for the wearer's saves.
 */
export const ALPHAVANTAGE_ROUTINE_CAP = 20;

/**
 * The plan the ledger holds each counted stock provider to, on a free key. Twelve Data counts its
 * clock minute and its UTC day, as Twelve Data does. Alpha Vantage counts the last 24 hours, 20 for a
 * routine fetch and 25 for a save.
 */
export const STOCK_QUOTA_PLANS: Record<string, QuotaPlan> = {
  twelvedata: {
    keyed: true,
    limits: [
      { calls: FREE_PLANS.twelvedata.perMinute ?? 0, window: 'minute', follows: 'clock' },
      { calls: FREE_PLANS.twelvedata.perDay ?? 0, window: 'day', follows: 'clock' },
    ],
  },
  alphavantage: {
    keyed: true,
    limits: [{ calls: FREE_PLANS.alphavantage.perDay ?? 0, routineMax: ALPHAVANTAGE_ROUTINE_CAP, window: 'day', follows: 'rolling' }],
  },
};

/** The providers whose free plan the ledger counts, the ones with a daily cap. */
export const COUNTED = Object.keys(STOCK_QUOTA_PLANS);

/** Where the stamps live in localStorage, apart from the stock cache so a provider change keeps them. */
export const LEDGER_KEY = 'stock-ledger';

// the stamps are kept by what every counted plan needs, so one rule fits whichever provider they belong to
// that is the last day, and up to a little past the largest daily cap
const KEPT_FOR: QuotaPlan = { keyed: true, limits: COUNTED.flatMap((provider) => STOCK_QUOTA_PLANS[provider].limits) };

/** What the ledger keeps for one key: its fingerprint, and the stamps spent on it. */
export interface ProviderLedger {
  keyPrint: string;
  sentMs: number[];
}

/** The stamps as plain times. Every stock call weighs 1, so each is saved as its time alone. */
function plainTimes(stamps: Stamp[]): number[] {
  return stamps.filter((stamp): stamp is number => typeof stamp === 'number');
}

/**
 * The stamps worth keeping. One older than a day is let go. One in the future, after the phone's
 * clock stepped back, counts as sent now rather than being dropped, so the count can never shrink
 * because the clock moved, and it still clears within a day.
 *
 * @param sentMs The stamps, in epoch milliseconds.
 * @param nowMs Now, in epoch milliseconds.
 * @return The stamps of the last day, oldest first.
 */
export function keepSent(sentMs: number[], nowMs: number): number[] {
  return plainTimes(keepStamps(sentMs, KEPT_FOR, nowMs));
}

/**
 * How many of the calls asked for fit inside a provider's free plan now.
 *
 * Twelve Data and Alpha Vantage are held to their plans in `STOCK_QUOTA_PLANS`. Yahoo, Finnhub, and
 * any paid plan have nothing counted here, and their own RATE LIMIT answers set the waits.
 *
 * @param provider The provider's id.
 * @param sentMs The stamps of the calls already sent to it, as `keepSent` returns them.
 * @param calls How many calls the round wants to send.
 * @param force True for a save, which may use the last of the day's calls.
 * @param paid True on a paid plan.
 * @param nowMs Now, in epoch milliseconds.
 * @return How many fit now, and when the rest would.
 */
export function allowance(provider: string, sentMs: number[], calls: number, force: boolean, paid: boolean, nowMs: number): Allowance {
  const plan = planFor(STOCK_QUOTA_PLANS, provider);

  if (!plan) {
    return { room: Math.max(0, calls), retryAtMs: 0 };
  }

  return planAllowance(plan, sentMs, { calls, force, paid }, nowMs);
}

/**
 * Reads the stamps spent on one key with one provider. Each key keeps its own, so swapping to another
 * key and back finds the first key's count where it was left.
 *
 * @param storage Where the ledger lives, normally localStorage.
 * @param provider The provider's id.
 * @param print The fingerprint of the key in use.
 * @param nowMs Now, in epoch milliseconds.
 * @return The stamps of the last day spent on this key.
 */
export function loadLedger(storage: LedgerStorage, provider: string, print: string, nowMs: number): number[] {
  // only plain times are read, so a weighted pair saved under this key can never push a real stamp out
  return keepSent(plainTimes(readStamps(storage, LEDGER_KEY, provider, print)), nowMs);
}

/**
 * Writes the stamps spent on one key beside the others, and shrugs if the phone will not take it. A key
 * with nothing spent in the last day is let go, so old keys do not pile up.
 *
 * @param storage Where the ledger lives, normally localStorage.
 * @param provider The provider's id.
 * @param ledger The key fingerprint and its stamps.
 * @param nowMs Now, in epoch milliseconds.
 */
export function saveLedger(storage: LedgerStorage, provider: string, ledger: ProviderLedger, nowMs: number): void {
  saveStamps(storage, LEDGER_KEY, provider, ledger.keyPrint, ledger.sentMs, KEPT_FOR, nowMs);
}
