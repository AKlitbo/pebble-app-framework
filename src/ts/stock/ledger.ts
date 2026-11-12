/**
 * The calls sent to each metered stock provider, and how many more its free plan has room for.
 *
 * Every call is stamped as it goes out and saved at once, so a round the phone kills partway through
 * still counts what it sent, and a round that never sent a call counts nothing. `allowance` reads the
 * stamps against the provider's free plan: Twelve Data by the clock minute and the UTC day, Alpha
 * Vantage over the last 24 hours, since when its day starts again is not published.
 */

import { FREE_PLANS } from './limits';

/** The providers whose free plan the ledger counts, the ones with a daily cap. */
export const COUNTED = Object.keys(FREE_PLANS).filter((provider) => FREE_PLANS[provider].perDay !== null);

/** Where the stamps live in localStorage, apart from the stock cache so a provider change keeps them. */
export const LEDGER_KEY = 'stock-ledger';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** The most stamps kept for one key, a little past the largest daily cap the ledger counts. */
const STAMPS_KEPT_MAX = Math.max(...COUNTED.map((provider) => FREE_PLANS[provider].perDay || 0)) + 100;

/**
 * Alpha Vantage's free key allows 25 calls a day. A routine fetch stops at 20, which leaves the last
 * 5 for the wearer's saves.
 */
export const ALPHAVANTAGE_ROUTINE_CAP = 20;

/** What the ledger keeps for one key: its fingerprint, and the stamps spent on it. */
export interface ProviderLedger {
  keyPrint: string;
  sentMs: number[];
}

/** The whole saved ledger: each provider, then each key fingerprint, then its stamps. */
type SavedLedger = Record<string, Record<string, number[]>>;

/** How many calls fit now, and when room opens for the rest. */
export interface Allowance {
  /** The most calls that can go out now, never more than were asked for. */
  room: number;
  /** When room opens for every call asked for, in epoch milliseconds, or 0 when they all fit now. */
  retryAtMs: number;
}

/** The slice of localStorage the ledger needs, passed in so the specs can hand it a fake. */
export interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A short fingerprint of an API key, so the ledger knows a key changed without keeping the key.
 *
 * @param key The API key.
 * @return The fingerprint.
 */
export function keyPrint(key: string): string {
  let hash = 5381;

  for (let index = 0; index < key.length; index++) {
    hash = ((hash * 33) ^ key.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
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
  return sentMs
    .map((ms) => Math.min(ms, nowMs))
    .filter((ms) => nowMs - ms < DAY_MS)
    .sort((left, right) => left - right)
    .slice(-STAMPS_KEPT_MAX);
}

/**
 * How many of the calls asked for fit inside a provider's free plan now.
 *
 * Twelve Data counts its clock minute and its UTC day, as Twelve Data does. Alpha Vantage counts the
 * last 24 hours, 20 for a routine fetch and 25 for a save. Yahoo, Finnhub, and any paid plan have
 * nothing counted here, and their own RATE LIMIT answers set the waits.
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
  if (paid || calls <= 0) {
    return { room: Math.max(0, calls), retryAtMs: 0 };
  }

  if (provider === 'twelvedata') {
    const minuteStart = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
    const dayStart = Math.floor(nowMs / DAY_MS) * DAY_MS;
    const perMinute = FREE_PLANS.twelvedata.perMinute ?? 0;
    const perDay = FREE_PLANS.twelvedata.perDay ?? 0;
    const minuteRoom = perMinute - sentMs.filter((ms) => ms >= minuteStart).length;
    const dayRoom = perDay - sentMs.filter((ms) => ms >= dayStart).length;
    const room = Math.max(0, Math.min(calls, minuteRoom, dayRoom));

    if (room >= calls) {
      return { room, retryAtMs: 0 };
    }

    // a second past the next minute, or a minute past the next UTC midnight once the day is spent
    return { room, retryAtMs: dayRoom < calls ? dayStart + DAY_MS + MINUTE_MS : minuteStart + MINUTE_MS + 1000 };
  }

  if (provider === 'alphavantage') {
    const cap = force ? (FREE_PLANS.alphavantage.perDay ?? 0) : ALPHAVANTAGE_ROUTINE_CAP;
    const room = Math.max(0, Math.min(calls, cap - sentMs.length));

    if (room >= calls) {
      return { room, retryAtMs: 0 };
    }

    // room for every call opens once enough of the oldest stamps are a day old
    const over = sentMs.length + calls - cap;

    return { room, retryAtMs: sentMs[Math.min(over, sentMs.length) - 1] + DAY_MS + 1000 };
  }

  return { room: calls, retryAtMs: 0 };
}

/** The saved ledger, or an empty one for anything that is not an object of providers. */
function readAll(storage: LedgerStorage): SavedLedger {
  try {
    const saved = JSON.parse(storage.getItem(LEDGER_KEY) as string);

    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch (error) {
    return {};
  }
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
  const keys = readAll(storage)[provider];
  const stamps = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys[print] : undefined;

  if (!Array.isArray(stamps)) {
    return [];
  }

  return keepSent(stamps.filter((ms: unknown) => typeof ms === 'number' && isFinite(ms) && ms > 0), nowMs);
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
  try {
    const all = readAll(storage);
    const saved = all[provider];
    const keys: Record<string, number[]> = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};

    keys[ledger.keyPrint] = ledger.sentMs;

    Object.keys(keys).forEach((print) => {
      if (!Array.isArray(keys[print]) || !keepSent(keys[print], nowMs).length) {
        delete keys[print];
      }
    });

    all[provider] = keys;
    storage.setItem(LEDGER_KEY, JSON.stringify(all));
  } catch (error) {
    // a ledger that cannot be written costs only a count that starts lower after a restart
  }
}
