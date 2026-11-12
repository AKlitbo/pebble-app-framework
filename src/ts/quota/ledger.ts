/**
 * The calls sent to a metered provider, and how many more its plan has room for.
 *
 * Nothing here knows which provider it is counting. A caller hands in the provider's plan, a list of
 * limits each on a minute, an hour, a day, or a month, and the stamps of the calls it already sent.
 * A limit either follows the UTC clock, starting again on the minute, the hour, midnight, or the 1st,
 * or rolls, counting back from now. Each call carries a weight, so a provider that bills a big request
 * as several calls is counted the way it counts.
 *
 * The stamps are saved under a localStorage key the caller names, as each provider, then each key
 * fingerprint, then its stamps. A call of weight 1 is saved as its time alone and a heavier one as a
 * time and weight pair, so a ledger of plain calls stays a list of times.
 */

/** How long a limit counts over. */
export type QuotaWindow = 'minute' | 'hour' | 'day' | 'month';

/** One limit in a provider's plan. */
export interface QuotaLimit {
  /** The most calls the window allows, counted by weight. */
  calls: number;
  /**
   * The most a routine call may bring the count to, which leaves the rest for the wearer's own asks.
   * Left out, a routine call may use all of `calls`.
   */
  routineMax?: number;
  /** The window the limit counts over. */
  window: QuotaWindow;
  /**
   * `clock` starts the window again on the UTC clock, at the minute, the hour, midnight, or the 1st.
   * `rolling` counts back from now, and a rolling month is the last 31 days.
   */
  follows: 'clock' | 'rolling';
}

/** What a provider's plan allows. */
export interface QuotaPlan {
  /** Whether the provider takes a key. A keyless one keeps one ledger per phone. */
  keyed: boolean;
  /** Every limit the calls are held to. A call goes out only when it fits inside all of them. */
  limits: QuotaLimit[];
}

/**
 * One call sent, as it is kept and saved. A call of weight 1 is its time in epoch milliseconds, and a
 * heavier one is its time and its weight.
 */
export type Stamp = number | [number, number];

/** The calls a round wants to send. */
export interface Ask {
  /** How many calls. */
  calls: number;
  /**
   * What each call counts as, 1 when left out. A weight is 1 or more, so one under 1 counts as 1, and
   * one that is not a number above 0 gets no room at all.
   */
  weight?: number;
  /** True for the wearer's own ask, such as a save, which may use what `routineMax` holds back. */
  force?: boolean;
  /** True on a paid plan, which lifts every limit and leaves the provider's own answers to set the waits. */
  paid?: boolean;
}

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

/** The whole saved ledger: each provider, then each key fingerprint, then its stamps. */
type SavedLedger = Record<string, Record<string, unknown>>;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The length of each window when it rolls, and of each clock window but the month. */
const WINDOW_MS: Record<QuotaWindow, number> = { minute: MINUTE_MS, hour: HOUR_MS, day: DAY_MS, month: 31 * DAY_MS };

// a sum of fractional weights can land a hair under a whole number, which would read as no room
const ROUNDING = 1e-9;

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
 * The fingerprint a provider's stamps are kept under. A keyless provider keeps every call under one
 * empty fingerprint, so a key typed for another provider cannot start its count again.
 *
 * @param plan The provider's plan.
 * @param key The API key in use, or empty for none.
 * @return The fingerprint to load and save the stamps under.
 */
export function ledgerPrint(plan: QuotaPlan, key: string): string {
  return plan.keyed && key ? keyPrint(key) : '';
}

/**
 * When a stamp went out.
 *
 * @param stamp The stamp.
 * @return Its time, in epoch milliseconds.
 */
export function stampMs(stamp: Stamp): number {
  return typeof stamp === 'number' ? stamp : stamp[0];
}

/**
 * What a stamp counts as. A weight under 1, or one that is not a number, counts as 1, so a stamp can
 * never make room by being there.
 *
 * @param stamp The stamp.
 * @return Its weight, 1 or more.
 */
export function stampWeight(stamp: Stamp): number {
  return typeof stamp === 'number' || !(stamp[1] >= 1) ? 1 : stamp[1];
}

/** A call's weight as it is counted, 1 or more, or null for one that is not a number above 0. */
function countedWeight(weight: number): number | null {
  if (!(typeof weight === 'number' && isFinite(weight) && weight > 0)) {
    return null;
  }

  return Math.max(1, weight);
}

/**
 * The plan for a provider id, or undefined when there is none. Only the table's own entries count, so
 * an id such as `constructor` finds nothing rather than something every object has.
 *
 * @param plans The plans, by provider id.
 * @param provider The provider's id.
 * @return Its plan, or undefined.
 */
export function planFor(plans: Record<string, QuotaPlan>, provider: string): QuotaPlan | undefined {
  return Object.prototype.hasOwnProperty.call(plans, provider) ? plans[provider] : undefined;
}

/** A stamp in the form it is kept, its time alone when it weighs 1. */
function makeStamp(atMs: number, weight: number): Stamp {
  return weight === 1 ? atMs : [atMs, weight];
}

/** The weight a call is stamped with, 1 for one that is not a number above 0. */
function stampedWeight(weight: number): number {
  return countedWeight(weight) ?? 1;
}

/**
 * Stamps a call as it goes out. A weight is 1 or more, so one under 1 is stamped as 1. A weight that
 * is not a number above 0 is stamped as 1 too. `allowance` gives such a call no room, but a caller
 * that sends it anyway still spent it, and the ledger errs toward counting more.
 *
 * @param stamps The stamps to add it to.
 * @param atMs When it went out, in epoch milliseconds.
 * @param weight What it counts as, 1 when left out.
 */
export function addStamp(stamps: Stamp[], atMs: number, weight = 1): void {
  stamps.push(makeStamp(atMs, stampedWeight(weight)));
}

/**
 * Takes back the stamp of a call that never reached the host, since it spent nothing. Only a stamp
 * with the same time and the same weight is taken, so a light call that failed in the same millisecond
 * as a heavy one leaves the heavy one's stamp in place.
 *
 * @param stamps The stamps to take it from.
 * @param atMs When the call went out, as it was stamped.
 * @param weight What it was stamped as, 1 when left out.
 * @return True when a stamp was taken back, so the caller knows to save.
 */
export function takeBack(stamps: Stamp[], atMs: number, weight = 1): boolean {
  const counted = stampedWeight(weight);
  const index = stamps.findIndex((stamp) => stampMs(stamp) === atMs && stampWeight(stamp) === counted);

  if (index === -1) {
    return false;
  }

  stamps.splice(index, 1);
  return true;
}

/** When the clock window holding a moment started. */
function clockStart(window: QuotaWindow, nowMs: number): number {
  if (window === 'month') {
    const now = new Date(nowMs);

    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }

  return Math.floor(nowMs / WINDOW_MS[window]) * WINDOW_MS[window];
}

/** When the clock window after the one holding a moment starts. */
function clockNext(window: QuotaWindow, nowMs: number): number {
  if (window === 'month') {
    const now = new Date(nowMs);

    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  }

  return clockStart(window, nowMs) + WINDOW_MS[window];
}

/** Whether a stamp counts against a limit now. */
function inWindow(limit: QuotaLimit, atMs: number, nowMs: number): boolean {
  return limit.follows === 'clock' ? atMs >= clockStart(limit.window, nowMs) : nowMs - atMs < WINDOW_MS[limit.window];
}

/**
 * When a spent limit has room for the calls asked for.
 *
 * A clock window opens a second past the next minute, or a minute past the next hour, midnight, or
 * 1st, since the provider's clock can sit a little behind the phone's. A rolling one opens a second
 * after enough of its oldest calls have aged out.
 */
function opensAt(limit: QuotaLimit, inside: Stamp[], over: number, nowMs: number): number {
  if (limit.follows === 'clock') {
    return clockNext(limit.window, nowMs) + (limit.window === 'minute' ? SECOND_MS : MINUTE_MS);
  }

  const windowMs = WINDOW_MS[limit.window];
  let freed = 0;

  for (const stamp of inside) {
    freed += stampWeight(stamp);

    if (freed >= over - ROUNDING) {
      return stampMs(stamp) + windowMs + SECOND_MS;
    }
  }

  // more is asked for than the limit ever allows, so the last call aging out is as good as it gets
  return (inside.length ? stampMs(inside[inside.length - 1]) : nowMs) + windowMs + SECOND_MS;
}

/**
 * How many of the calls asked for fit inside a provider's plan now.
 *
 * Each limit is read on its own, and the room is what the tightest leaves. When some calls do not fit,
 * the wait is for the last limit to open, so every call asked for fits once it is up. A paid plan has
 * nothing counted, and the provider's own `RATE LIMIT` answers set its waits. A weight that is not a
 * number above 0 gets no room, and a wait of the plan's longest window, as a call no plan can fit.
 *
 * @param plan The provider's plan.
 * @param stamps The calls already sent to it, as `keepStamps` returns them.
 * @param ask The calls the round wants to send.
 * @param nowMs Now, in epoch milliseconds.
 * @return How many fit now, and when the rest would.
 */
export function allowance(plan: QuotaPlan, stamps: readonly Stamp[], ask: Ask, nowMs: number): Allowance {
  const calls = ask.calls;

  if (ask.paid || calls <= 0) {
    return { room: Math.max(0, calls), retryAtMs: 0 };
  }

  const weight = countedWeight(ask.weight ?? 1);

  if (weight === null) {
    return { room: 0, retryAtMs: nowMs + longestWindow(plan) + SECOND_MS };
  }

  const sorted = stamps.slice().sort((left, right) => stampMs(left) - stampMs(right));
  let room = calls;
  let retryAtMs = 0;

  plan.limits.forEach((limit) => {
    const cap = !ask.force && limit.routineMax !== undefined ? limit.routineMax : limit.calls;
    const inside = sorted.filter((stamp) => inWindow(limit, stampMs(stamp), nowMs));
    const used = inside.reduce<number>((sum, stamp) => sum + stampWeight(stamp), 0);
    const fits = Math.max(0, Math.floor((cap - used) / weight + ROUNDING));

    if (fits < calls) {
      room = Math.min(room, fits);
      retryAtMs = Math.max(retryAtMs, opensAt(limit, inside, used + calls * weight - cap, nowMs));
    }
  });

  return { room, retryAtMs: room >= calls ? 0 : retryAtMs };
}

/** The longest window in a plan, or 0 for a plan with no limits. */
function longestWindow(plan: QuotaPlan): number {
  return Math.max(0, ...plan.limits.map((limit) => WINDOW_MS[limit.window]));
}

/** The largest limit in a plan, or 0 for a plan with no limits. */
function largestLimit(plan: QuotaPlan): number {
  return Math.max(0, ...plan.limits.map((limit) => limit.calls));
}

/**
 * The stamps worth keeping for a plan, oldest first.
 *
 * One older than the plan's longest window is let go. One in the future, after the phone's clock
 * stepped back, counts as sent now rather than being dropped, so the count can never shrink because
 * the clock moved, and it still ages out on time. One whose time is not a number is dropped.
 *
 * The calls of a UTC hour that ended a day ago or more are merged into one stamp at the hour's last
 * moment, carrying their summed weight rounded up to thousandths. Only a month window can still see
 * them by then. A clock month reads the same hour, and a rolling month holds them up to an hour longer,
 * which errs on the side of fewer calls. A month of calls then keeps a stamp an hour for the month,
 * plus one a call for the last day.
 *
 * @param stamps The stamps.
 * @param plan The provider's plan.
 * @param nowMs Now, in epoch milliseconds.
 * @return The stamps the plan's windows can still see.
 */
export function keepStamps(stamps: readonly Stamp[], plan: QuotaPlan, nowMs: number): Stamp[] {
  const keepMs = longestWindow(plan);
  const most = largestLimit(plan) + 100;
  const recent: Stamp[] = [];
  const hours = new Map<number, number>();

  stamps.forEach((stamp) => {
    const atMs = Math.min(stampMs(stamp), nowMs);

    if (!isFinite(atMs) || nowMs - atMs >= keepMs) {
      return;
    }

    const hourEnd = Math.floor(atMs / HOUR_MS) * HOUR_MS + HOUR_MS - 1;

    if (nowMs - hourEnd >= DAY_MS) {
      hours.set(hourEnd, (hours.get(hourEnd) || 0) + stampWeight(stamp));
    } else {
      recent.push(makeStamp(atMs, stampWeight(stamp)));
    }
  });

  hours.forEach((weight, hourEnd) => {
    // the small take-off stops a sum such as 3.9, a hair over in floating point, rounding up past it
    recent.push(makeStamp(hourEnd, Math.ceil(weight * 1000 - 1e-6) / 1000));
  });

  return recent.sort((left, right) => stampMs(left) - stampMs(right)).slice(-most);
}

/** Whether a saved value is a stamp the ledger can count. */
function isStamp(value: unknown): value is Stamp {
  const valid = (ms: unknown) => typeof ms === 'number' && isFinite(ms) && ms > 0;

  return valid(value) || (Array.isArray(value) && value.length === 2 && valid(value[0]) && valid(value[1]));
}

/** Whether a saved value is a plain object rather than a list or anything else. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A saved object's own entry for a key, so a key such as `__proto__` finds nothing. */
function ownEntry(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

/** The saved ledger, or an empty one for anything that is not an object of providers. */
function readAll(storage: LedgerStorage, storageKey: string): SavedLedger {
  try {
    const saved = JSON.parse(storage.getItem(storageKey) as string);

    return isRecord(saved) ? (saved as SavedLedger) : {};
  } catch (error) {
    return {};
  }
}

/**
 * Reads the stamps saved for one key with one provider as they were saved, with anything that is not a
 * stamp left out. Nothing is let go for its age. `loadStamps` is the read to count from, and this one
 * is for a caller with its own rule for what to keep.
 *
 * @param storage Where the ledger lives, normally localStorage.
 * @param storageKey The localStorage key the ledger is saved under.
 * @param provider The provider's id.
 * @param print The fingerprint of the key in use.
 * @return The saved stamps, in the order they were saved.
 */
export function readStamps(storage: LedgerStorage, storageKey: string, provider: string, print: string): Stamp[] {
  const keys = ownEntry(readAll(storage, storageKey), provider);
  const stamps = isRecord(keys) ? ownEntry(keys, print) : undefined;

  return Array.isArray(stamps) ? stamps.filter(isStamp) : [];
}

/**
 * Reads the stamps spent on one key with one provider. Each key keeps its own, so swapping to another
 * key and back finds the first key's count where it was left. Anything saved that is not a stamp is
 * left out, and so is a weight above the plan's largest limit. No real call could spend that much,
 * and one such stamp would hold the provider off for a whole window.
 *
 * @param storage Where the ledger lives, normally localStorage.
 * @param storageKey The localStorage key the ledger is saved under.
 * @param provider The provider's id.
 * @param print The fingerprint of the key in use, from `ledgerPrint` or `keyPrint`.
 * @param plan The provider's plan, which sets what is kept.
 * @param nowMs Now, in epoch milliseconds.
 * @return The stamps the plan's windows can still see.
 */
export function loadStamps(storage: LedgerStorage, storageKey: string, provider: string, print: string, plan: QuotaPlan, nowMs: number): Stamp[] {
  const largest = largestLimit(plan);
  const stamps = readStamps(storage, storageKey, provider, print).filter((stamp) => stampWeight(stamp) <= largest);

  return keepStamps(stamps, plan, nowMs);
}

/**
 * Writes the stamps spent on one key beside the others, and shrugs if the phone will not take it. A key
 * with nothing the plan's windows can still see is let go, so old keys do not pile up.
 *
 * @param storage Where the ledger lives, normally localStorage.
 * @param storageKey The localStorage key the ledger is saved under.
 * @param provider The provider's id.
 * @param print The fingerprint of the key in use.
 * @param stamps The stamps spent on it.
 * @param plan The provider's plan, which sets what is kept.
 * @param nowMs Now, in epoch milliseconds.
 */
export function saveStamps(storage: LedgerStorage, storageKey: string, provider: string, print: string, stamps: readonly Stamp[], plan: QuotaPlan, nowMs: number): void {
  try {
    const all = readAll(storage, storageKey);
    const saved = ownEntry(all, provider);
    const keys: Record<string, unknown> = isRecord(saved) ? saved : {};

    keys[print] = stamps;

    Object.keys(keys).forEach((other) => {
      const kept = keys[other];

      if (!Array.isArray(kept) || !keepStamps(kept.filter(isStamp), plan, nowMs).length) {
        delete keys[other];
      }
    });

    all[provider] = keys;
    storage.setItem(storageKey, JSON.stringify(all));
  } catch (error) {
    // a ledger that cannot be written costs only a count that starts lower after a restart
  }
}
