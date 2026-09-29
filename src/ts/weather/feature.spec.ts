/**
 * Specs for the weather feature's own helpers.
 *
 * The coordinate checks, the saved-city reader, the retry delays, and the one-at-a-time weather
 * round are the parts a reader cannot check by eye. How the feature plugs into the app's lifecycle
 * is covered with the app's own specs.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validCoord,
  getManualLocation,
  weatherRetryDelayMs,
  runWeatherRound,
  WEATHER_RETRY_DELAYS_MS,
  conditionLabel,
} from './feature';

describe('validCoord', () => {
  /** An in-range pair is the only thing that should be forwarded to a provider. */
  test('accepts an in-range coordinate pair', () => {
    const result = validCoord(33.4, -112);

    expect(result).toBe(true);
  });

  /** Out-of-range or non-numeric coordinates must be rejected before they reach the network. */
  test.each([
    ['latitude too high', 91, 0],
    ['latitude too low', -91, 0],
    ['longitude too high', 0, 181],
    ['longitude too low', 0, -181],
    ['non-numeric latitude', '33', -112],
    ['missing longitude', 33, undefined],
  ])('rejects %s', (label, lat, lon) => {
    const result = validCoord(lat, lon);

    expect(result).toBe(false);
  });
});

describe('getManualLocation', () => {
  /** A valid saved place must yield its coordinates and label so the watch fetches the right city. */
  test('returns coordinates and label for an in-range saved location', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix' }) };

    const result = getManualLocation(config);

    expect(result).toEqual({ coords: { lat: 33.4, lon: -112 }, label: 'Phoenix' });
  });

  /** An out-of-range blob must be treated as no manual location, never forwarded verbatim. */
  test('rejects an out-of-range saved coordinate', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 999, lon: -112, label: 'Bad' }) };

    const result = getManualLocation(config);

    expect(result).toBeNull();
  });

  /** Malformed JSON must not throw and must fall back to no location. */
  test('returns null for a malformed saved value', () => {
    const config = { LOCATION_NAME: 'not json' };

    const result = getManualLocation(config);

    expect(result).toBeNull();
  });

  /** An unset location must be null so the caller falls back to GPS or a no-location status. */
  test('returns null when no location is saved', () => {
    const result = getManualLocation({});

    expect(result).toBeNull();
  });
});

describe('conditionLabel', () => {
  /** The watch has no word table of its own, so a wrong or missing word here is what the panel shows. */
  test.each([
    ['PCLDY', 'Partly Cloudy'],
    ['PCLDY_NIGHT', 'Partly Cloudy'],
    ['NOPE', 'Unknown'],
    [undefined, 'Unknown'],
  ])('reads %s as %s', (token, expected) => {
    const result = conditionLabel(token);

    expect(result).toBe(expected);
  });
});

describe('weatherRetryDelayMs', () => {
  /** A successful fetch that still scheduled a retry would re-poll the provider for no reason. */
  test('returns null when the fetch succeeded', () => {
    const result = weatherRetryDelayMs(true, 0);

    expect(result).toBe(null);
  });

  /** Without the first retry a cold-launch miss sits blank until the 30-min poll. */
  test('returns the first delay when the first attempt failed', () => {
    const result = weatherRetryDelayMs(false, 0);

    expect(result).toBe(5000);
  });

  /** The second attempt must back off further so a still-warming gps gets more time. */
  test('returns the longer delay for the second attempt', () => {
    const result = weatherRetryDelayMs(false, 1);

    expect(result).toBe(15000);
  });

  /**
   * A bad key fails the same way seconds later, so each retry spent another call on the provider's
   * quota, plus the paired Open-Meteo call, for an answer that could not change.
   */
  test('returns null for a failure that waits on the settings', () => {
    const result = weatherRetryDelayMs(false, 0, 'INVALID KEY');

    expect(result).toBe(null);
  });

  /** A provider's call cap does not lift seconds later, so each retry only spent more of it. */
  test('returns null for a rate limit', () => {
    const result = weatherRetryDelayMs(false, 0, 'RATE LIMIT');

    expect(result).toBe(null);
  });

  /** A network failure can clear by the next try, so it still retries. */
  test('still retries a network failure', () => {
    const result = weatherRetryDelayMs(false, 0, 'NET ERROR');

    expect(result).toBe(5000);
  });

  /** Uncapped retries would loop forever on a genuinely bad key or a dead feed. */
  test('returns null once the attempts are used up', () => {
    const result = weatherRetryDelayMs(false, 2);

    expect(result).toBe(null);
  });
});

describe('runWeatherRound', () => {
  // a fresh round state for each test. it is the object getWeather carries in the closure
  function freshState() {
    return { inFlight: false, round: 0 };
  }

  type FakeResult = { ok: boolean; temperature?: number };

  // a fetch that holds each result callback open so a spec decides when and how it lands
  function heldFetches() {
    const callbacks: Array<(result: FakeResult) => void> = [];
    const deps = {
      fetchWeather: (onResult: (result: FakeResult) => void) => callbacks.push(onResult),
      sendWeather: vi.fn(),
      timeoutMs: 60000,
    };
    return { callbacks, deps };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The watch re-asks every 3s until its first reading lands, and each ask must not start another gps fix and provider fetch. */
  test('ignores an unforced round while a fetch is running', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);
    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);
  });

  /** An ask landing between a failed fetch and its retry must not start a second retry chain. */
  test('ignores an unforced round while a retry is waiting', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);

    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A weather setting change must replace a running round, and the old round's late result must not reach the watch. */
  test('lets a forced round replace a running one and ignores the old result', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    runWeatherRound(state, false, deps);

    runWeatherRound(state, true, deps);
    callbacks[0]({ ok: true, temperature: 1 });
    callbacks[1]({ ok: true, temperature: 2 });

    expect(deps.sendWeather).toHaveBeenCalledTimes(1);
    expect(deps.sendWeather).toHaveBeenCalledWith({ ok: true, temperature: 2 });
    expect(state.inFlight).toBe(false);
  });

  /** A round replaced while it waits on a retry must not fire that retry later. */
  test('drops the pending retry when a forced round replaces it', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    runWeatherRound(state, true, deps);
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A fetch that never calls back must not hold off every later ask for the rest of the JS session. */
  test('frees the round via the watchdog when a fetch never calls back', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    runWeatherRound(state, false, deps);

    vi.advanceTimersByTime(deps.timeoutMs);
    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(2);
  });

  /** Once the retries are used up the next ask has to be free to try again. */
  test('frees the round once the retries are used up', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    runWeatherRound(state, false, deps);

    callbacks[0]({ ok: false });
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);
    callbacks[1]({ ok: false });
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[1]);
    callbacks[2]({ ok: false });

    expect(deps.sendWeather).toHaveBeenCalledTimes(3);
    expect(state.inFlight).toBe(false);
  });

  /** A send that throws, say on a dict the bridge refuses, must not leave the round in flight or every later ask is dropped until the JS restarts. */
  test('frees the round when sending the result throws', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    deps.sendWeather.mockImplementation(() => {
      throw new Error('bad dict');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runWeatherRound(state, false, deps);

    callbacks[0]({ ok: true });

    expect(state.inFlight).toBe(false);
  });
});
