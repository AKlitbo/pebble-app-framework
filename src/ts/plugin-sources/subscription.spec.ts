// @vitest-environment jsdom
/**
 * Specs for the plugin source subscription.
 *
 * The unit sits between a feature and the phone's plugin calls, and the phone is someone else's
 * code. The transitions worth pinning are the ones that decide whether data keeps coming: a second
 * start leaving one subscription rather than two, an ending error going idle so the slow tick can
 * bring it back, a permission error leaving it running so the data that follows is not missed, and
 * a stop that keeps the slow tick from subscribing a face that left plugin mode. The quick retry is
 * pinned with fake timers: it brings a plugin the wearer just turned on within minutes, stays quiet,
 * runs one timer at most, stops once a subscription is live or the unit is stopped, and gives up after
 * its window so a phone with plugins left off is not woken every two minutes all day. Idle
 * subscriptions share that one timer, and each keeps its own window on it. A unit made with the quick
 * retry off starts no timer at all, stays off another's, and retries only when asked. Nothing the phone
 * does may throw past the unit. A plugin list it cannot read leaves the phone to route the request,
 * and only a real list with nothing serving the item, a missing subscribe call, or a subscribe that
 * throws or gives back no handle reads as no plugin. The saved state
 * is what the settings page warns from, so it is pinned per item and against a store that throws.
 *
 * localStorage comes from jsdom and the bridge from the fake Pebble.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSourceSubscription, NO_PLUGIN, QUICK_RETRY_MS, QUICK_RETRY_WINDOW_MS } from './subscription';
import type { SourceEnvelope, SourceError, SourceSubscription, SubscriptionOptions } from './types';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble, SourceRequest } from '../testing/pebble';

// one plugin serving each item the features subscribe to
const WEATHER_PLUGIN = { uuid: 'weather-uuid', name: 'Weather', sources: [{ category: 'weather', items: ['location'] }], actions: [] };
const CALENDAR_PLUGIN = { uuid: 'calendar-uuid', name: 'Calendar', sources: [{ category: 'calendar', items: ['event'] }], actions: [] };

// an update holding one place, as the built-in weather plugin sends it
const UPDATE: SourceEnvelope = {
  pluginUuid: 'weather-uuid',
  instances: [{ instanceId: 'home', properties: { name: { shortText: { text: 'Toronto' } } } }],
};

let pebble: FakePebble;

/** A weather subscription that records what it hands the feature. */
function weatherSubscription(overrides: Partial<SubscriptionOptions> = {}) {
  const updates: SourceEnvelope[] = [];
  const errors: SourceError[] = [];
  const subscription = createSourceSubscription({
    category: 'weather',
    item: 'location',
    properties: ['name', 'temperature'],
    onUpdate: (envelope) => updates.push(envelope),
    onError: (error) => errors.push(error),
    ...overrides,
  });

  return { subscription, updates, errors };
}

/** A calendar subscription, for the specs that need a second kind beside the weather. */
function calendarSubscription(overrides: Partial<SubscriptionOptions> = {}) {
  return weatherSubscription({ category: 'calendar', item: 'event', properties: ['name'], ...overrides });
}

/** Starts a subscription and hands back what the fake bridge was asked for. */
function requestFrom(subscription: SourceSubscription): SourceRequest {
  subscription.start();

  return pebble.subscriptions[pebble.subscriptions.length - 1].request;
}

beforeEach(() => {
  localStorage.clear();
  pebble = withFakePebble();
  pebble.plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];
});

afterEach(() => {
  pebble.restore();
  vi.restoreAllMocks();
});

describe('start', () => {
  /** The phone routes an unnamed subscription to the wearer's preferred plugin, which naming one would skip. */
  test('subscribes to the item without naming a plugin', () => {
    const { subscription } = weatherSubscription();

    const result = requestFrom(subscription);

    expect(result).toMatchObject({ category: 'weather', item: 'location', properties: ['name', 'temperature'] });
    expect(result.plugin).toBeUndefined();
  });

  /** A second ready in one session must not leave two subscriptions sending the same weather twice. */
  test('leaves one live subscription after a second start', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    subscription.start();

    expect(pebble.subscriptions).toHaveLength(2);
    expect(pebble.live()).toEqual([pebble.subscriptions[1]]);
  });

  /** With nothing to answer, the feature has to hear why so it can show No Plugin. */
  test('reports no plugin and starts nothing with an empty plugin list', () => {
    pebble.plugins = [];
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    expect(pebble.subscribeToSource).not.toHaveBeenCalled();
    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN]);
    expect(subscription.live()).toBe(false);
  });

  /** A calendar plugin cannot answer a weather subscription, so it must not count as one that serves it. */
  test('reports no plugin when only another item is served', () => {
    pebble.plugins = [CALENDAR_PLUGIN];
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN]);
  });
});

describe('updates', () => {
  /** A unit change reconverts the kept update, so it has to be kept, and the feature has to get it. */
  test('keeps the update and hands it to the feature', () => {
    const { subscription, updates } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push(UPDATE);

    expect(updates).toEqual([UPDATE]);
    expect(subscription.latest()).toEqual(UPDATE);
  });

  /** The page names the plugin that answered last, and warns about an empty calendar. */
  test('saves which plugin answered and whether the update was empty', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push({ pluginUuid: 'weather-uuid', instances: [] });

    const result = subscription.state();

    expect(result).toEqual({ pluginUuid: 'weather-uuid', lastError: null, lastEmpty: true });
  });

  /** Once the wearer allows Location and data lands, the page must stop asking them to allow it. */
  test('clears a saved error when an update lands', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });
    pebble.subscriptions[0].push(UPDATE);

    const result = subscription.state();

    expect(result.lastError).toBeNull();
  });

  /** An update that does not say who sent it must not wipe the plugin the page names. */
  test('keeps the saved plugin for an update with no uuid', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push(UPDATE);
    pebble.subscriptions[0].push({ instances: [] });

    const result = subscription.state();

    expect(result.pluginUuid).toBe('weather-uuid');
  });

  /**
   * A provider switch ends the subscription. An update the phone still delivers to it afterwards
   * would put plugin weather on the watch over a fetched reading.
   */
  test('drops an update from a subscription it has ended', () => {
    const { subscription, updates } = weatherSubscription();

    subscription.start();
    const staleOnData = pebble.subscriptions[0].request.onData;

    subscription.stop();
    staleOnData(UPDATE);

    expect(updates).toEqual([]);
  });
});

describe('errors', () => {
  /** The phone has ended the subscription, so staying live would leave the slow tick never retrying. */
  test('goes idle on PLUGIN_UNAVAILABLE and the slow tick brings it back', () => {
    const { subscription, errors } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });

    expect(subscription.live()).toBe(false);
    expect(errors.map((error) => error.code)).toEqual(['PLUGIN_UNAVAILABLE']);

    subscription.retryIfIdle();

    expect(subscription.live()).toBe(true);
    expect(pebble.live()).toEqual([pebble.subscriptions[1]]);
  });

  /** Data follows once the wearer allows it, so a retry here would only stack a second subscription. */
  test('stays live on PERMISSION_DENIED and the slow tick leaves it alone', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });
    subscription.retryIfIdle();

    expect(subscription.live()).toBe(true);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** The page asks the wearer to allow the calendar from this saved code. */
  test('saves the code of the last error', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });

    const result = subscription.state();

    expect(result.lastError).toBe('PERMISSION_DENIED');
  });

  /**
   * A unit change reconverts the kept update. After the phone ended the subscription that would put
   * a gone plugin's reading back on the watch. The plugin may come back, so the page still names it.
   */
  test('drops the kept update on PLUGIN_UNAVAILABLE but keeps the saved plugin', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push(UPDATE);
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });

    const result = { latest: subscription.latest(), pluginUuid: subscription.state().pluginUuid };

    expect(result).toEqual({ latest: null, pluginUuid: 'weather-uuid' });
  });
});

describe('no plugin', () => {
  /** A unit change after plugins went away must not put the removed plugin's reading back on the watch. */
  test('drops the kept update', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push(UPDATE);
    pebble.plugins = [];
    subscription.start();

    const result = subscription.latest();

    expect(result).toBeNull();
  });

  /** The page must never pair a plugin that has gone with nothing serving the item. */
  test('clears the saved plugin and empty flag', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].push({ pluginUuid: 'weather-uuid', instances: [] });
    pebble.plugins = [];
    subscription.start();

    const result = subscription.state();

    expect(result).toEqual({ pluginUuid: null, lastError: NO_PLUGIN, lastEmpty: false });
  });

  /** A later ready in the same session is how the feature hears to resend No Plugin to a rebooted watch. */
  test('reports again on every explicit start', () => {
    pebble.plugins = [];
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    subscription.start();

    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN, NO_PLUGIN]);
  });

  /** Each slow tick with no plugin finds the same again, and the feature must not hear it every tick. */
  test('reports once across idle slow ticks', () => {
    pebble.plugins = [];
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    subscription.retryIfIdle();
    subscription.retryIfIdle();

    expect(errors).toHaveLength(1);
  });

  /** A plugin that answered and then went away must be reported, or the feature never shows No Plugin for it. */
  test('reports again after a subscription has started since', () => {
    const { subscription, errors } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });
    pebble.plugins = [];

    subscription.retryIfIdle();

    expect(errors.map((error) => error.code)).toEqual(['PLUGIN_UNAVAILABLE', NO_PLUGIN]);
  });
});

describe('retryIfIdle', () => {
  /** Plugins turned back on must bring the weather back at the next slow tick, with no visit to settings. */
  test('subscribes once a plugin is back after no plugin', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];

    subscription.retryIfIdle();

    expect(pebble.live()).toHaveLength(1);
  });

  /** A face that switched to a fetching provider must not be subscribed again by the slow tick. */
  test('does nothing after stop', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    subscription.stop();

    subscription.retryIfIdle();

    expect(pebble.live()).toEqual([]);
  });

  /** A face in fetch mode never started, so the slow tick must not put it in plugin mode. */
  test('does nothing before the first start', () => {
    const { subscription } = weatherSubscription();

    subscription.retryIfIdle();

    expect(pebble.subscribeToSource).not.toHaveBeenCalled();
  });
});

describe('the quick retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A plugin the wearer turns on while the face runs would otherwise wait for the slow tick, about 30 minutes. */
  test('subscribes within the retry interval once a plugin is back after no plugin', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = subscription.live();

    expect(result).toBe(true);
    expect(pebble.live()).toHaveLength(1);
  });

  /** After the phone ends the subscription, the plugin coming back has to be picked up without waiting for the slow tick. */
  test('runs again after the phone ends the subscription', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = pebble.live();

    expect(result).toEqual([pebble.subscriptions[1]]);
  });

  /** Retrying a live subscription would end it and start another every two minutes, dropping updates in between. */
  test('stops once a subscription is live and an update lands', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);
    pebble.subscriptions[0].push(UPDATE);
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = vi.getTimerCount();

    expect(result).toBe(0);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A face that switched to a fetching provider must not be subscribed again two minutes later. */
  test('stops on stop', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    subscription.stop();
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = vi.getTimerCount();

    expect(result).toBe(0);
    expect(pebble.subscribeToSource).not.toHaveBeenCalled();
  });

  /** Data follows once the wearer allows it, so a retry here would only stack a second subscription. */
  test('does not run while a permission error leaves the subscription live', () => {
    const { subscription } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PERMISSION_DENIED', message: 'not allowed' });
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = pebble.subscriptions;

    expect(result).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  /** Every retry with plugins still off finds the same again, and the feature must not hear it every two minutes. */
  test('reports no plugin once across its retries', () => {
    pebble.plugins = [];
    const { subscription, errors } = weatherSubscription();

    subscription.start();
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = errors.map((error) => error.code);

    expect(result).toEqual([NO_PLUGIN]);
  });

  /** An ending code on every retry would reach the feature, and so the watch, once every two minutes. */
  test('reports an ending code once across its retries', () => {
    const { subscription, errors } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });

    for (let retry = 0; retry < 3; retry++) {
      vi.advanceTimersByTime(QUICK_RETRY_MS);
      pebble.subscriptions[pebble.subscriptions.length - 1].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'No plugin for weather/location' });
    }

    const result = errors.map((error) => error.code);

    expect(result).toEqual(['PLUGIN_UNAVAILABLE']);
    expect(pebble.subscriptions).toHaveLength(4);
  });

  /** A plugin that answered and then went away again must be reported, or the watch keeps its old reading as current. */
  test('reports an ending code again after an update lands in between', () => {
    const { subscription, errors } = weatherSubscription();

    subscription.start();
    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });
    vi.advanceTimersByTime(QUICK_RETRY_MS);
    pebble.subscriptions[1].push(UPDATE);
    pebble.subscriptions[1].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });

    const result = errors.map((error) => error.code);

    expect(result).toEqual(['PLUGIN_UNAVAILABLE', 'PLUGIN_UNAVAILABLE']);
  });

  /** With plugins left off, a retry that never gave up would wake PebbleKit JS every two minutes all session. */
  test('stops once its window has passed, leaving the slow tick to carry on', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = { timers: vi.getTimerCount(), live: subscription.live() };

    subscription.retryIfIdle();

    expect(result).toEqual({ timers: 0, live: false });
    expect(subscription.live()).toBe(true);
  });

  /** A wearer opening the settings to turn plugins on after the window has passed would otherwise wait for the slow tick. */
  test('runs again for its whole window after retrySoon', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);
    subscription.retrySoon();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS - QUICK_RETRY_MS);
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = subscription.live();

    expect(result).toBe(true);
  });

  /** The slow tick's own retries must not keep the window open, or it would never close on a phone with plugins off. */
  test('keeps its window through slow ticks', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS / 2);
    subscription.retryIfIdle();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS / 2);

    const result = vi.getTimerCount();

    expect(result).toBe(0);
  });

  /** A face in fetch mode never started, so opening its settings must not start a retry for a plugin it does not use. */
  test('does nothing on retrySoon before the first start', () => {
    const { subscription } = weatherSubscription();

    subscription.retrySoon();
    vi.advanceTimersByTime(QUICK_RETRY_MS * 3);

    const result = vi.getTimerCount();

    expect(result).toBe(0);
    expect(pebble.subscribeToSource).not.toHaveBeenCalled();
  });

  /** A second timer would retry twice as often and outlive the stop that clears only one of them. */
  test('runs one timer across repeated starts and slow ticks', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription();

    subscription.start();
    subscription.start();
    subscription.retryIfIdle();
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = vi.getTimerCount();

    expect(result).toBe(1);
  });
});

describe('the quick retry shared between subscriptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A face with several plugin kinds would otherwise wake PebbleKit JS once for each kind, each at its own moment. */
  test('runs one timer for two idle subscriptions', () => {
    pebble.plugins = [];
    const weather = weatherSubscription().subscription;
    const calendar = calendarSubscription().subscription;

    weather.start();
    calendar.start();
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = vi.getTimerCount();

    expect(result).toBe(1);
  });

  /** A shared timer that only retried the kind that started it would leave the other waiting for the slow tick. */
  test('retries both idle subscriptions on the one timer', () => {
    pebble.plugins = [];
    const weather = weatherSubscription().subscription;
    const calendar = calendarSubscription().subscription;

    weather.start();
    calendar.start();
    pebble.plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = { weather: weather.live(), calendar: calendar.live() };

    expect(result).toEqual({ weather: true, calendar: true });
  });

  /** One kind going live must not stop the timer another kind is still waiting on. */
  test('keeps retrying the idle one after the other goes live', () => {
    pebble.plugins = [];
    const weather = weatherSubscription().subscription;
    const calendar = calendarSubscription().subscription;

    weather.start();
    calendar.start();
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);
    pebble.plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = calendar.live();

    expect(result).toBe(true);
    expect(pebble.subscriptions.filter((subscription) => subscription.request.category === 'weather')).toHaveLength(1);
  });

  /**
   * Each window is its own. One that closes must not close the other's, and the timer stops only
   * once the last one has closed, or a phone with plugins off is woken every two minutes all session.
   */
  test('closes each window on its own and stops the timer after the last', () => {
    pebble.plugins = [];
    const weather = weatherSubscription().subscription;
    const calendar = calendarSubscription().subscription;

    weather.start();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS / 3);
    calendar.start();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS * 2 / 3);
    pebble.plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = { weather: weather.live(), calendar: calendar.live() };

    expect(result).toEqual({ weather: false, calendar: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the quick retry turned off', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A quiet unit beside one with the quick retry must not be woken by the timer the other runs. */
  test('stays off the timer another subscription runs', () => {
    pebble.plugins = [];
    const quiet = weatherSubscription({ quickRetry: false }).subscription;
    const calendar = calendarSubscription().subscription;

    quiet.start();
    calendar.start();
    pebble.plugins = [WEATHER_PLUGIN, CALENDAR_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = { quiet: quiet.live(), calendar: calendar.live() };

    expect(result).toEqual({ quiet: false, calendar: true });
  });

  /** A source nothing on the watch waits on would otherwise wake the phone every two minutes for half an hour with plugins off. */
  test('never tries again on its own while it sits idle', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription({ quickRetry: false });

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);

    const result = subscription.live();

    expect(result).toBe(false);
    expect(pebble.enumeratePlugins).toHaveBeenCalledTimes(1);
  });

  /** Opening the settings has to pick up a plugin the wearer just turned on. */
  test('tries again on retrySoon', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription({ quickRetry: false });

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];
    subscription.retrySoon();

    const result = subscription.live();

    expect(result).toBe(true);
  });

  /** A retrySoon that opened a window would bring back the two minute wakes this option is there to stop. */
  test('tries once on retrySoon rather than opening a window', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription({ quickRetry: false });

    subscription.start();
    subscription.retrySoon();
    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);

    const result = pebble.enumeratePlugins.mock.calls.length;

    expect(result).toBe(2);
  });

  /** The slow tick is the only retry left to it, so that one has to work. */
  test('still starts again on a slow tick', () => {
    pebble.plugins = [];
    const { subscription } = weatherSubscription({ quickRetry: false });

    subscription.start();
    pebble.plugins = [WEATHER_PLUGIN];
    subscription.retryIfIdle();

    const result = subscription.live();

    expect(result).toBe(true);
  });
});

describe('a phone that misbehaves', () => {
  /** A phone without plugins has neither call, and the feature must hear no plugin rather than throw. */
  test('reads a bridge without the plugin calls as no plugin', () => {
    pebble.restore();
    pebble = withFakePebble({ plugins: false });
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    expect(subscription.plugins()).toEqual([]);
    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN]);
  });

  /**
   * A list call that throws says nothing about what is installed. Reading it as no plugin would hold
   * a phone whose plugins would answer on No Plugin.
   */
  test('subscribes anyway when the plugin list throws', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    const { subscription } = weatherSubscription();

    subscription.start();

    expect(pebble.live()).toHaveLength(1);
  });

  /** A list reply that is not a list leaves the phone to route the request, the same as one that throws. */
  test('subscribes anyway when the plugin list is not a list', () => {
    pebble.enumeratePlugins.mockImplementation(() => '[]');
    const { subscription } = weatherSubscription();

    subscription.start();

    expect(pebble.live()).toHaveLength(1);
  });

  /**
   * The page and the seed read the list too. A throw says nothing about what is installed, and
   * reading it as none would label a working plugin as switched off or drop a restored choice.
   */
  test('reads a plugin list that throws as unreadable rather than empty', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    const { subscription } = weatherSubscription();

    const result = subscription.plugins();

    expect(result).toBeNull();
  });

  /** A reply that is not a list must not reach the standard check as one, nor pass for an empty list. */
  test('reads a plugin list that is not a list as unreadable', () => {
    pebble.enumeratePlugins.mockImplementation(() => '[]');
    const { subscription } = weatherSubscription();

    const result = subscription.plugins();

    expect(result).toBeNull();
  });

  /** No handle means the phone never started one, and reading it as live would leave nothing to retry. */
  test('reads a subscribe that gives back no handle as no plugin', () => {
    pebble.subscribeToSource.mockImplementationOnce(() => undefined as unknown as { unsubscribe(): void });
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    expect(subscription.live()).toBe(false);
    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN]);
  });

  /** The phone may start one on the next try, so the slow tick has to make it. */
  test('retries a subscribe that gave back no handle at the next slow tick', () => {
    pebble.subscribeToSource.mockImplementationOnce(() => undefined as unknown as { unsubscribe(): void });
    const { subscription } = weatherSubscription();

    subscription.start();

    subscription.retryIfIdle();

    expect(pebble.live()).toHaveLength(1);
  });

  /** A subscribe that throws must leave the unit idle, so the slow tick can try again. */
  test('reads a subscribe that throws as no plugin', () => {
    pebble.subscribeToSource.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    const { subscription, errors } = weatherSubscription();

    subscription.start();

    expect(subscription.live()).toBe(false);
    expect(errors.map((error) => error.code)).toEqual([NO_PLUGIN]);
  });

  /** A feature's onUpdate that throws must not escape into the phone's bridge. */
  test('keeps a throw from the feature onUpdate inside', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { subscription } = weatherSubscription({
      onUpdate: () => {
        throw new Error('feature bug');
      },
    });

    subscription.start();
    const onData = pebble.subscriptions[0].request.onData;

    const result = () => onData(UPDATE);

    expect(result).not.toThrow();
  });

  /** A feature's onError that throws while start reports no plugin would escape into the slow tick that called it. */
  test('keeps a throw from the feature onError inside', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pebble.plugins = [];
    const { subscription } = weatherSubscription({
      onError: () => {
        throw new Error('feature bug');
      },
    });

    const result = () => subscription.start();

    expect(result).not.toThrow();
  });
});

describe('state', () => {
  /** The weather and calendar checks must never read each other's plugin. */
  test('keeps the state apart per category and item', () => {
    const { subscription: weather } = weatherSubscription();
    const calendar = createSourceSubscription({ category: 'calendar', item: 'event', onUpdate: () => {}, onError: () => {} });

    weather.start();
    calendar.start();
    pebble.subscriptions[0].push(UPDATE);
    pebble.subscriptions[1].push({ pluginUuid: 'calendar-uuid', instances: [] });

    const result = [weather.state().pluginUuid, calendar.state().pluginUuid];

    expect(result).toEqual(['weather-uuid', 'calendar-uuid']);
  });

  /** The page can open in a later session than the one that heard the update, so the state has to outlive the unit. */
  test('reads the state a previous session saved', () => {
    const { subscription: first } = weatherSubscription();

    first.start();
    pebble.subscriptions[0].push(UPDATE);
    const { subscription: second } = weatherSubscription();

    const result = second.state();

    expect(result.pluginUuid).toBe('weather-uuid');
  });

  /** A store that throws must cost only the warning rows, never the weather itself. */
  test('still hands the update on when the store throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { subscription, updates } = weatherSubscription();

    subscription.start();

    pebble.subscriptions[0].push(UPDATE);

    expect(updates).toEqual([UPDATE]);
    expect(subscription.state()).toEqual({ pluginUuid: null, lastError: null, lastEmpty: false });
  });
});
