/**
 * What each stock provider's free plan allows, in one place.
 *
 * The figures are each provider's own, as its pages gave them on 10 November 2026. The ledger counts
 * calls against them. The schedule's floors in schedule.ts are set to fit inside them, so a provider
 * that changes its free plan is corrected here and, if a floor no longer fits, there too. On a paid
 * plan the free plan's floors and counts are left out, and the provider's own RATE LIMIT answers set
 * every wait.
 */

/** One provider's free plan. A limit it does not publish is null. */
export interface FreePlan {
  /** The most calls in a second. */
  perSecond: number | null;
  /** The most calls in a minute. */
  perMinute: number | null;
  /** The most calls in a day. */
  perDay: number | null;
  /** When the daily count starts again: midnight UTC, the New York day, or not published. */
  dayResets: 'utc' | 'new-york' | null;
  /** The markets the free plan covers. */
  covers: 'us' | 'global';
  /** Whether a key is needed, and so whether a paid plan exists to turn on. */
  keyed: boolean;
}

/**
 * Each provider's free plan.
 *
 * Yahoo publishes nothing, and turns a phone it is throttling away with a 429 for minutes to more than
 * a day. Finnhub allows 60 calls a minute and 30 a second, with no daily cap. Twelve Data's Basic plan
 * allows 8 a minute and 800 a day, one per ticker, and covers US markets only. Alpha Vantage allows 25
 * a day, and turns away a call closer than about a second to the last.
 */
export const FREE_PLANS: Record<string, FreePlan> = {
  yahoo: { perSecond: null, perMinute: null, perDay: null, dayResets: null, covers: 'global', keyed: false },
  finnhub: { perSecond: 30, perMinute: 60, perDay: null, dayResets: null, covers: 'us', keyed: true },
  twelvedata: { perSecond: null, perMinute: 8, perDay: 800, dayResets: 'utc', covers: 'us', keyed: true },
  alphavantage: { perSecond: 1, perMinute: null, perDay: 25, dayResets: null, covers: 'global', keyed: true },
};

/**
 * The gap the phone leaves after one call answers before the next, for a provider whose free plan
 * allows one call a second. A little over the second, so two calls never land inside one.
 */
export const ONE_A_SECOND_GAP_MS = 1100;

/**
 * Whether a paid plan lifts the free plan's floors and counts for a provider.
 *
 * @param provider The provider's id, such as `twelvedata`.
 * @param paidPlan What the Paid Plan toggle saved, or undefined when the face has none.
 * @return True for a keyed provider with Paid Plan on.
 */
export function onPaidPlan(provider: string, paidPlan: boolean | undefined): boolean {
  return Boolean(paidPlan) && Object.prototype.hasOwnProperty.call(FREE_PLANS, provider) && FREE_PLANS[provider].keyed;
}
