// @vitest-environment jsdom
/**
 * Specs for the calendar feature's plugin mode.
 *
 * The iCal rounds are covered with the app's own specs. Plugin mode is pinned here, driving the
 * feature's hooks straight against the fake Pebble. What is worth pinning is which save does what,
 * since the calendar select is one the page adds and its default has to read the same before and
 * after the first save, that an error never clears the agenda while an empty update does, what a
 * watch ask resends, what the seed brings back after a reset, the hold that keeps the agenda on a
 * fresh install, and that a face built without the define runs exactly as it always has.
 *
 * localStorage comes from jsdom, and the plugin code is swapped for null where a spec needs a face
 * without the define. Vitest runs every spec on a Toronto phone, and the usual now is Wednesday 4
 * November 2026 at 12:00 there, on standard time at UTC-5.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import calendar from './feature';
import buildConfig from '../pkjs/config-builder';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';
import { installFakeXhr } from '../testing/xhr';
import type { FakeXhr } from '../testing/xhr';
import type { FeatureContext, FeatureHooks, ProviderLists } from '../pkjs/feature';
import { AGENDA_HOLD_MS } from '../plugin-sources/calendar-driver';
import type { ClayConfigItem } from '../clay/types';
import { PLUGIN_KINDS_TYPE, PLUGINS_OFF_TEXT } from '../plugin-sources/page';
import { escapeHtml } from '../plugin-sources/escape';
import { CALENDAR_TEXTS } from '../plugin-sources/calendar';

// a plugin serving neither the weather nor the calendar, so the phone's list is readable and not empty
const OTHER_PLUGIN = { uuid: 'other-uuid', name: 'Other', sources: [{ category: 'music', items: ['track'] }] };

// the plugin code a face built with PLUGIN_CALENDAR finds, which a spec turns off to stand for a
// face built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('../plugin-sources/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../plugin-sources/index')>();

  return {
    ...real,
    get calendarPlugins() {
      return pluginCode.off ? null : real.calendarPlugins;
    },
  };
});

// the keys a calendar face declares, each standing for its own number, so a send reads by name
const CALENDAR_FACE_KEYS = {
  CALENDAR_REQUEST: 'CALENDAR_REQUEST',
  CALENDAR_STRIP: 'CALENDAR_STRIP',
  CALENDAR_SOURCE: 'CALENDAR_SOURCE',
  CALENDAR_ICS_URL: 'CALENDAR_ICS_URL',
} as unknown as Record<string, number>;

// the built-in calendar plugin, trimmed to the readings the standard check reads
const BUILT_IN_CALENDAR = {
  uuid: '00000000-0000-0000-0001-000000000004',
  name: 'Calendar',
  sources: [{ category: 'calendar', items: ['event'], properties: { name: ['shortText', 'longText'], starts_at: ['timestamp'], ends_at: ['timestamp'] } }],
};

const FEED_URL = 'https://example.com/calendar.ics';

// an empty but valid feed, so an iCal round that lands sends an empty agenda
const EMPTY_FEED = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

/** Epoch seconds for a moment on 4 November 2026 given in Toronto, five hours behind UTC that day. */
function toronto(hour: number, minute = 0): number {
  return Date.UTC(2026, 10, 4, hour + 5, minute) / 1000;
}

/** One timed event as the built-in plugin sends it. */
function event(title: string, start: number, end: number) {
  return {
    instanceId: title,
    properties: {
      name: { shortText: { text: title.slice(0, 7) }, longText: { text: title } },
      starts_at: { timestamp: { value: start } },
      ends_at: { timestamp: { value: end } },
      all_day: { boolean: { value: false } },
    },
  };
}

// a dentist at 12:30 and a meeting at 15:00, both later today
const DENTIST = event('Dentist', toronto(12, 30), toronto(13, 0));
const MEETING = event('Team meeting', toronto(15, 0), toronto(16, 0));

/** One update from the built-in plugin. */
function update(...instances: unknown[]) {
  return { pluginUuid: BUILT_IN_CALENDAR.uuid, instances };
}

/** Saves the wearer's settings the way Clay leaves them in localStorage. */
function saveSettings(settings: Record<string, unknown>): void {
  localStorage.setItem('clay-settings', JSON.stringify(settings));
}

/**
 * A face with the calendar keys and its sends recorded, each acked straight away, and with ready
 * already run when asked. With `asks` it declares the settings request key as well, so its ready
 * sends the settings ask. Fetches go to the fake XMLHttpRequest, so a spec counts them without
 * touching the network.
 */
function startFace(options: { providers?: ProviderLists | null; defaults?: Record<string, unknown>; ready?: boolean; asks?: boolean } = {}) {
  const sends: Record<string, unknown>[] = [];
  const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => {
    sends.push(dict);
    onOk?.();
  });
  const hooks = calendar({
    messageKeys: options.asks ? { ...CALENDAR_FACE_KEYS, SETTINGS_REQUEST: 'SETTINGS_REQUEST' as unknown as number, SETTINGS_FRESH: 'SETTINGS_FRESH' as unknown as number } : CALENDAR_FACE_KEYS,
    defaults: options.defaults || {},
    queueSend: queueSend as unknown as FeatureContext['queueSend'],
    refetchDelayMs: 250,
    providers: options.providers === undefined ? null : options.providers,
  });

  if (options.ready) {
    hooks.ready?.();
  }

  return { hooks, sends };
}

/** How many events each strip sent to the watch held, which is the strip's first byte. */
function stripCounts(sends: Record<string, unknown>[]): number[] {
  return sends.map((dict) => (dict.CALENDAR_STRIP as number[])[0]);
}

/** Saves a page visit's new settings between the open and the close, as the phone does. */
function saveFromPage(hooks: FeatureHooks, settings: Record<string, unknown>): void {
  hooks.configOpened?.();
  saveSettings(settings);
  hooks.configSaved?.();
}

/** The page without the plugin kinds store every kind's page hook puts first, so a spec reads the face's own rows. */
function faceRows(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.filter((item) => item.type !== PLUGIN_KINDS_TYPE);
}

/** Every row on a page, sections and their rows included. */
function allRowsOf(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...allRowsOf(item.items || [])]);
}

/** The rows of the section holding a message key, empty when no section holds it. */
function sectionRows(page: ClayConfigItem[], messageKey: string): ClayConfigItem[] {
  return page.find((item) => (item.items || []).some((row) => row.messageKey === messageKey))?.items || [];
}

/** The option values of the Calendar Source select on a page, or undefined when it has none. */
function sourceOptions(page: ClayConfigItem[]): unknown[] | undefined {
  return allRowsOf(page).find((row) => row.messageKey === 'CALENDAR_SOURCE')?.options?.map((option) => option.value);
}

describe('calendar plugin mode', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(toronto(12) * 1000);
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A second ready in one session that left the first subscription running would send every update twice. */
  test('leaves one subscription running after a second ready', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks } = startFace();

    hooks.ready?.();
    hooks.ready?.();

    expect(pebble.subscriptions).toHaveLength(2);
    expect(pebble.live()).toHaveLength(1);
  });

  /** A wearer on the phone's calendars whose hidden iCal link still fetched would see that feed's events instead. */
  test('subscribes rather than fetching on ready while the plugin is picked', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace();

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** The watch takes plugin events through the strip an iCal round fills, so events sent anywhere else would never show. */
  test('sends an update to the watch as the agenda strip', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(MEETING, DENTIST));

    expect(stripCounts(sends)).toEqual([2]);
  });

  /** An empty update is how the watch hears the last event was deleted, so holding it back would keep a deleted event on the agenda. */
  test('sends an empty strip for an empty update', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(DENTIST));
    pebble.live()[0].push(update());

    expect(sends.map((dict) => dict.CALENDAR_STRIP)).toEqual([expect.any(Array), [0]]);
  });

  /** The plugin sends once a minute when anything changed, and an unchanged strip would wake the watch for nothing. */
  test('skips an update that would send the watch what it already holds', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(DENTIST));
    pebble.live()[0].push(update(DENTIST));

    expect(sends).toHaveLength(1);
  });

  /** A watch that rebooted asks with an empty agenda, and the plugin only sends again on a change. */
  test('resends the kept events on a watch ask without starting a new subscription', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update(DENTIST));

    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** Before the first update there is nothing to say, and an empty strip would clear an agenda the watch still holds. */
  test('sends nothing for a watch ask before the first update', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(sends).toEqual([]);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A resend of the update as it came would put an event that already ended back on the agenda. */
  test('leaves off a resend an event that ended since the update', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update(DENTIST, MEETING));
    vi.setSystemTime(toronto(13, 30) * 1000);

    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(stripCounts(sends)).toEqual([2, 1]);
  });

  /** The watch has no status line for the calendar, so an error that cleared the strip would empty a good agenda for nothing. */
  test.each([
    ['PERMISSION_DENIED'],
    ['PLUGIN_UNAVAILABLE'],
  ])('keeps the agenda and sends nothing for %s', (code) => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(DENTIST));

    pebble.live()[0].fail({ code, message: 'Calendar' });

    expect(sends).toHaveLength(1);
  });

  /**
   * Plugins switched off after the pick. Falling back to the hidden iCal link could show a different
   * calendar, such as a work feed, so the face sends nothing and keeps the choice for when they come back.
   */
  test('sends nothing with no plugin on the phone, starts no fetch, and subscribes on a later slow tick once one is back', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    pebble.plugins = [];
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.plugins = [BUILT_IN_CALENDAR];
    hooks.refresh?.(true);

    expect(sends).toEqual([]);
    expect(fetches).toHaveLength(0);
    expect(pebble.live()).toHaveLength(1);
  });

  /** The plugin sends on every change, so a quick tick that subscribed again would only churn the phone's bridge. */
  test('does nothing on a tick that is not a slow one', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    pebble.plugins = [];
    const { hooks } = startFace({ ready: true });

    pebble.plugins = [BUILT_IN_CALENDAR];

    hooks.refresh?.(false);

    expect(pebble.subscriptions).toHaveLength(0);
  });

  /**
   * A seed can save the plugin with no ready or save after it, such as a seed while the settings
   * page is open. A unit never started is one retryIfIdle cannot bring back, so the slow
   * tick has to start it, or the agenda never fills until the next ready.
   */
  test('starts the subscription on a slow tick when the plugin was picked with nothing started', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveSettings({ CALENDAR_ICS_URL: FEED_URL, CALENDAR_SOURCE: 'plugin' });

    hooks.refresh?.(true);

    expect(pebble.live()).toHaveLength(1);
  });

  /** The watch asks on its refresh interval, so its ask is the soonest chance to start a plugin nothing started. */
  test('starts the subscription on a watch ask when the plugin was picked with nothing started', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveSettings({ CALENDAR_ICS_URL: FEED_URL, CALENDAR_SOURCE: 'plugin' });

    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(1);
  });

  /** A choice that moved off the plugin with no save after it would keep the plugin's events covering the feed's. */
  test('stops a subscription left running once the choice moved off the plugin', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });

    hooks.refresh?.(true);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A subscription left running after the switch would keep putting the phone's events over the feed's. */
  test('ends the subscription and runs an iCal round for a switch away from the plugin', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    vi.advanceTimersByTime(250);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** Every launch downloaded the feed twice, once as the phone came up and again for the watch's ask a moment after. */
  test('answers the ask that follows a launch with the agenda it just downloaded', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks, sends } = startFace({ ready: true });

    fetches[0].respond(200, EMPTY_FEED);
    vi.advanceTimersByTime(2000);
    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(fetches).toHaveLength(1);
    expect(stripCounts(sends)).toEqual([0, 0]);
  });

  /** The watch's own poll after the gap has to download, or an edited event never reaches the watch. */
  test('downloads for an ask a minute after the last download', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    fetches[0].respond(200, EMPTY_FEED);
    vi.advanceTimersByTime(60 * 1000);
    hooks.message?.({ CALENDAR_REQUEST: 1 });

    expect(fetches).toHaveLength(2);
  });

  /** A save with a new link has to download it, however soon after the last download it lands. */
  test('downloads for a save just after a download', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    fetches[0].respond(200, EMPTY_FEED);
    saveFromPage(hooks, { CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: 'https://example.com/other.ics' });
    vi.advanceTimersByTime(250);

    expect(fetches).toHaveLength(2);
  });

  /** A download still out for the feed would land after the switch and put the feed's events over the plugin's. */
  test('subscribes for a switch to the plugin and drops the round still out', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks, sends } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    fetches[0].respond(200, EMPTY_FEED);
    vi.advanceTimersByTime(1000);

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(1);
    expect(sends).toEqual([]);
  });

  /** A wearer who saves the plugin again after the phone ended it would otherwise wait for the slow tick, half an hour away. */
  test('starts a subscription the phone ended again for a save onto the plugin', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks } = startFace({ ready: true });

    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });
    saveFromPage(hooks, { CALENDAR_SOURCE: 'plugin' });

    expect(pebble.live()).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(2);
  });

  /** The link row is hidden while the plugin is picked, and a save that touched it must not start a download. */
  test('does nothing for a link-only save in plugin mode', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: 'https://example.com/other.ics' });
    vi.advanceTimersByTime(1000);

    expect(fetches).toHaveLength(0);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /**
   * The page has no Calendar Source row of its own, so before the first save nothing is saved for it.
   * With no plugin known to serve the events that reads as iCal, and a watch reading it as anything
   * else would count the first save as a switch and fetch again.
   */
  test('counts no source change for a first save with the select left on iCal Link', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    saveSettings({ CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_ICS_URL: FEED_URL, CALENDAR_SOURCE: 'ical' });
    vi.advanceTimersByTime(1000);

    expect(fetches).toHaveLength(1);
  });

  /**
   * A save from a page without the select, which a phone with nothing serving the events opens, drops
   * the saved plugin, since Clay writes the settings whole from the rows on the page. The source then
   * has to read back as iCal and the feed has to load, or the face sits on a subscription the page no
   * longer shows.
   */
  test('reads a save without the select as iCal and runs an iCal round', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ ready: true });

    pebble.plugins = [];
    saveFromPage(hooks, { CALENDAR_ICS_URL: FEED_URL });
    vi.advanceTimersByTime(250);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /**
   * A face whose default is the plugin would otherwise start on a feed it never offered. A list the
   * phone will not give does not count as a plugin serving the events, so the default stands.
   */
  test.each([
    ['the face\'s default when it sets one', { CALENDAR_SOURCE: 'plugin' }, 1],
    ['iCal when the face sets none', {}, 0],
  ])('reads a missing source with no link as %s while the plugin list cannot be read', (_label, defaults, subscriptions) => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    saveSettings({ CALENDAR_POLL: 1 });

    startFace({ defaults, ready: true });

    expect(pebble.subscriptions).toHaveLength(subscriptions);
  });

  /**
   * A save made with plugins off, or on a face from before plugin sources, holds the link and no
   * source. A face whose default is the plugin would otherwise drop the wearer's feed.
   */
  test('reads a saved link with no source as iCal on a face whose default is the plugin', () => {
    saveSettings({ CALENDAR_ICS_URL: FEED_URL });

    startFace({ defaults: { CALENDAR_SOURCE: 'plugin' }, ready: true });

    expect(pebble.subscriptions).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });
});

describe('calendar plugin mode with the source never saved', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(toronto(12) * 1000);
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A fresh install on a phone that already has a calendar plugin would otherwise ask for an iCal link it does not need. */
  test('subscribes rather than sending an empty agenda while a plugin serves the events and no link is saved', () => {
    saveSettings({ CALENDAR_POLL: 1 });

    const { sends } = startFace({ ready: true });

    expect(pebble.live()).toHaveLength(1);
    expect(sends).toEqual([]);
  });

  /**
   * The source select is on the page only while a plugin is on offer, so a save made with plugins
   * off holds the link and no source. A calendar plugin turning up later must not drop the wearer's feed.
   */
  test('keeps downloading a saved link with no source while a plugin serves the events', () => {
    saveSettings({ CALENDAR_ICS_URL: FEED_URL });

    startFace({ ready: true });

    expect(pebble.subscriptions).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** The page has to open on the source the watch is getting, so a saved link opens it on iCal Link. */
  test('opens the select on iCal Link for a saved link with no source', () => {
    saveSettings({ CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'CALENDAR_SOURCE')?.defaultValue).toBe('ical');
  });

  /** A wearer who saved iCal while the plugin was on offer has chosen, and the plugin must not take the agenda back. */
  test('keeps a saved iCal source while a plugin serves the events', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });

    startFace({ ready: true });

    expect(pebble.subscriptions).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A wearer who never chose the plugin would otherwise sit on an agenda nothing fills once plugins go off. */
  test('ends the subscription and runs an iCal round on a slow tick once plugins go off', () => {
    saveSettings({ CALENDAR_POLL: 1 });
    const { hooks, sends } = startFace({ ready: true });

    pebble.plugins = [];
    vi.advanceTimersByTime(60 * 1000);
    hooks.refresh?.(true);

    expect(pebble.subscriptions).toHaveLength(1);
    expect(pebble.live()).toHaveLength(0);
    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /**
   * A page that opened on the plugin for a source never saved, then saved iCal, leaves the saved source
   * reading the same as the default did. Without counting the move the feed would wait for the slow tick.
   */
  test('downloads the feed for a first save onto iCal from a page that opened on the plugin', () => {
    saveSettings({ CALENDAR_POLL: 1 });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    vi.advanceTimersByTime(250);

    expect(pebble.subscriptions).toHaveLength(1);
    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A wearer who never chose the plugin would otherwise keep a frozen agenda until the slow tick. */
  test('runs an iCal round at once when the phone stops serving the events', () => {
    saveSettings({ CALENDAR_POLL: 1 });
    const { sends } = startFace({ ready: true });

    pebble.plugins = [];
    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'plugins turned off' });

    expect(pebble.live()).toHaveLength(0);
    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** A first save of the plugin the face already reads from is no switch, so it must not start a second subscription. */
  test('keeps the one subscription for a first save onto the plugin', () => {
    saveSettings({ CALENDAR_POLL: 1 });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    vi.advanceTimersByTime(250);

    expect(pebble.subscriptions).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });
});

describe('calendar plugin mode before any settings are saved', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  // a list that serves the events reads a source never saved as the plugin, so only a list the phone
  // will not give runs an iCal round the seed may still undo
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    pebble = withFakePebble();
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * On a fresh install of the Pebble app the face's ready runs before the watch's settings reply
   * lands. A list the phone will not give says nothing about what is installed, so the seed may still
   * bring the plugin back, and an empty strip then would clear the agenda the plugin fills.
   */
  test('sends nothing for an iCal round with no link and nothing saved while the plugin list cannot be read', () => {
    const { sends } = startFace({ ready: true, asks: true });

    expect(sends).toEqual([]);
  });

  /**
   * With nothing serving the events the seed can never bring the plugin back, so holding the strip
   * would only leave the watch without one. The watch's calendar store would then read as never
   * filled, unlike on a face without the define.
   */
  test.each([
    ['plugins on and none serving the events', true],
    ['no plugin calls on the phone', false],
  ])('sends an empty strip for an iCal round with no link and nothing saved with %s', (_label, calls) => {
    pebble.restore();
    pebble = withFakePebble({ plugins: calls });

    const { sends } = startFace({ ready: true, asks: true });

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** A face with no settings request key gets no settings reply and no seed, so a hold would last the whole session. */
  test('sends an empty strip for an iCal round with no link on a face with no settings request key', () => {
    const { sends } = startFace({ ready: true });

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /**
   * The seed lifts the hold, and a round held before it has to run again. A brand new watch would
   * otherwise show a never-synced agenda until its next poll or the slow tick.
   */
  test('runs the held round once the seed leaves the plugin unpicked', () => {
    const { hooks, sends } = startFace({ ready: true, asks: true });
    const config: Record<string, unknown> = { CALENDAR_POLL: 1 };

    hooks.seeded?.(config, (name) => (name === 'CALENDAR_SOURCE' ? 'ical' : undefined));
    saveSettings(config);
    vi.advanceTimersByTime(250);

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** The seed has already decided, so the timeout running the round again would send the watch a second strip. */
  test('runs the held round only once when the seed lands before the timeout', () => {
    const { hooks, sends } = startFace({ ready: true, asks: true });
    const config: Record<string, unknown> = { CALENDAR_POLL: 1 };

    hooks.seeded?.(config, () => undefined);
    saveSettings(config);
    vi.advanceTimersByTime(AGENDA_HOLD_MS);

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** A watch that turned away every ask sends no reply this session, so the held round has to run now or the agenda never syncs. */
  test('runs the held round once the watch turns away every settings ask', () => {
    const { hooks, sends } = startFace({ ready: true, asks: true });

    hooks.settingsUnanswered?.();

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** With no settings ask out, nothing can bring the plugin back, so a later round must not hold again. */
  test('holds no later round once the watch turns away every settings ask', () => {
    const { hooks, sends } = startFace({ ready: true, asks: true });

    hooks.settingsUnanswered?.();
    hooks.message?.({ CALENDAR_REQUEST: 1 } as unknown as Record<string, number>);

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }, { CALENDAR_STRIP: [0] }]);
  });

  /** A reply the watch never sent, or one lost on the way, would otherwise hold the agenda back for the whole session. */
  test('runs the held round once the hold times out', () => {
    const { sends } = startFace({ ready: true, asks: true });

    vi.advanceTimersByTime(AGENDA_HOLD_MS - 1);
    const before = [...sends];

    vi.advanceTimersByTime(1);

    expect(before).toEqual([]);
    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** A save leaves the phone holding settings, so the hold's timeout running the round again would fetch the feed twice. */
  test('fetches the feed once when a save with a link lands during the hold', () => {
    const { hooks } = startFace({ ready: true, asks: true });

    saveFromPage(hooks, { CALENDAR_ICS_URL: FEED_URL });
    vi.advanceTimersByTime(250);
    fetches[0].respond(200, EMPTY_FEED);
    vi.advanceTimersByTime(AGENDA_HOLD_MS);

    expect(fetches).toHaveLength(1);
  });

  /** A save that changes nothing a round reads starts no refetch of its own, so the round the hold kept back has to run once. */
  test('sends the held empty agenda once after a save that changes nothing a round reads', () => {
    const { hooks, sends } = startFace({ ready: true, asks: true });

    saveFromPage(hooks, { CALENDAR_POLL: 1 });
    vi.advanceTimersByTime(AGENDA_HOLD_MS);

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });

  /** A wearer who cleared the link has to see the agenda clear, as on a face without plugins. */
  test('sends an empty strip for an iCal round with no link once any settings are saved', () => {
    saveSettings({ CALENDAR_ICS_URL: '' });

    const { sends } = startFace({ ready: true });

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });
});

describe('calendar plugin mode after a reset', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
    installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** Runs the face's seeded hook on the settings a seed took back from the watch, as the seed does before it saves. */
  function seed(hooks: FeatureHooks, echo: Record<string, unknown>, restored: Record<string, unknown> = {}): Record<string, unknown> {
    const config = { ...restored };

    hooks.seeded?.(config, (name) => echo[name]);
    return config;
  }

  /**
   * The page has no Calendar Source row, so the seed's own copy skips the key. Without the hook a
   * wearer who picked the Pebble app would drop to iCal after a reset, and the next round with no
   * link would clear the agenda.
   */
  test('restores an echoed plugin while a plugin serves the events', () => {
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' });

    expect(result).toEqual({ CALENDAR_SOURCE: 'plugin' });
    expect(pebble.live()).toHaveLength(1);
  });

  /** A list the phone will not give says nothing about what is installed, and dropping the choice would lose a plugin that still answers. */
  test('restores an echoed plugin when the plugin list cannot be read', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' });

    expect(result).toEqual({ CALENDAR_SOURCE: 'plugin' });
  });

  /**
   * Plugins switched off list nothing, which reads the same as a plugin removed. The page keeps a
   * saved plugin with plugins off, so the reset has to keep it too, or the next round with no link
   * clears the agenda the plugin gives back once plugins are on again.
   */
  test('keeps an echoed plugin with plugins off', () => {
    pebble.plugins = [];
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' });

    expect(result).toEqual({ CALENDAR_SOURCE: 'plugin' });
  });

  /** A Pebble app from before plugins can never answer, so a kept plugin would leave the agenda with nothing to fill it. */
  test('leaves an echoed plugin out on a phone with no plugin calls', () => {
    pebble.restore();
    pebble = withFakePebble({ plugins: false });
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' });

    expect(result).toEqual({});
    expect(pebble.subscriptions).toHaveLength(0);
  });

  /**
   * A face that placed the select itself has a row for the key, so the seed's own copy brings the
   * plugin back too. On a phone with no plugin calls that copy has to come out, or the agenda sits
   * with nothing to fill it.
   */
  test('takes out a plugin the seed copied on a phone with no plugin calls', () => {
    pebble.restore();
    pebble = withFakePebble({ plugins: false });
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' }, { CALENDAR_SOURCE: 'plugin' });

    expect(result).toEqual({});
  });

  /**
   * The watch keeps iCal for a choice nobody ever made. Writing it back would pin a wearer who never
   * chose to the iCal link after every reset, even with a calendar plugin on the phone.
   */
  test('leaves an echoed ical out, so a plugin serving the events takes the source', () => {
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'ical' });

    expect(result).toEqual({});
    expect(pebble.live()).toHaveLength(1);
  });

  /** The phone's own saved choice wins over the watch's echo, so the watch must not undo a choice the phone saved. */
  test('leaves the source alone when the phone already held one of its own', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical' });
    const { hooks } = startFace();

    const result = seed(hooks, { CALENDAR_SOURCE: 'plugin' }, { CALENDAR_SOURCE: 'ical' });

    expect(result).toEqual({ CALENDAR_SOURCE: 'ical' });
  });

  /** A seed with the page closed starts the plugin, and the save straight after it must not subscribe a second time. */
  test('subscribes once for a seed followed by the save after it', () => {
    const { hooks } = startFace({ ready: true });
    const config: Record<string, unknown> = {};

    hooks.configOpened?.();
    hooks.seeded?.(config, (name) => (name === 'CALENDAR_SOURCE' ? 'plugin' : undefined));
    saveSettings(config);
    hooks.configSaved?.();

    expect(pebble.subscriptions).toHaveLength(1);
  });
});

describe('calendar plugin mode on the settings page', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The face's own page has no Calendar Source row, so the page hook is the only way a wearer can pick the phone's calendars. */
  test('adds the Calendar Source select under the section\'s heading, offering iCal Link and Preferred Source', () => {
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(sourceOptions(result)).toEqual(['ical', 'plugin']);
    expect(sectionRows(result, 'CALENDAR_ICS_URL')[1]).toMatchObject({ messageKey: 'CALENDAR_SOURCE', label: 'Calendar Source' });
  });

  /** The face reads a source never saved as a plugin that serves the events, so a page opening on iCal Link would show a source the watch is not getting. */
  test('opens the select on the plugin with nothing saved while a plugin serves the events', () => {
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'CALENDAR_SOURCE')?.defaultValue).toBe('plugin');
  });

  /** A saved choice always stands, and the face's own page must keep its default for the defaults and the restore. */
  test('opens the select on iCal Link for a saved iCal source', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical' });
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'CALENDAR_SOURCE')?.defaultValue).toBe('ical');
  });

  /** A select offering iCal Link alone is no choice, and a wearer with plugins off has to see today's page. */
  test('adds no select with plugins off and nothing saved', () => {
    pebble.plugins = [];
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(sourceOptions(result)).toBeUndefined();
    expect(allRowsOf(result).find((row) => row.messageKey === 'CALENDAR_ICS_URL')?.visibleWhen).toBeUndefined();
  });

  /** With plugins off, a save from a page with no select would drop the saved plugin and the next round would clear the agenda. */
  test('keeps a saved plugin on offer with plugins off', () => {
    pebble.plugins = [];
    saveSettings({ CALENDAR_SOURCE: 'plugin' });
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ calendar: {} })) || [];

    expect(sourceOptions(result)).toEqual(['ical', 'plugin']);
  });

  /** The notes and the supported plugins panel are drawn by components the app has to register, and a face without the define must never be handed them. */
  test('hands the app the note and panel components along with the page hook', () => {
    const { hooks } = startFace();

    const result = (hooks.components || []).map((component) => (component as { name: string }).name);

    expect(result).toEqual(['pluginNote', 'pluginPanel', 'pluginKinds']);
  });
});

describe('calendar plugin mode for a plugin only face', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];
  const ONLY = { calendar: ['plugin'] };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The face offers nothing else, so a saved link left over from before must not start a download. */
  test('subscribes on ready whatever source is saved', () => {
    saveSettings({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ providers: ONLY });

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** An iCal round would download a feed the face never offers, or with no link send an empty strip over the phone's events. */
  test('runs no iCal round on a watch ask, a slow tick, or a save', () => {
    saveSettings({ CALENDAR_ICS_URL: FEED_URL });
    const { hooks, sends } = startFace({ providers: ONLY, ready: true });

    hooks.message?.({ CALENDAR_REQUEST: 1 });
    hooks.refresh?.(true);
    saveFromPage(hooks, { CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: '' });
    vi.advanceTimersByTime(1000);

    expect(fetches).toHaveLength(0);
    expect(sends).toEqual([]);
    expect(pebble.live()).toHaveLength(1);
  });

  /** A plugin only face keeps no choice on the watch, so a seed has nothing to bring back. */
  test('brings no seeded hook', () => {
    const { hooks } = startFace({ providers: ONLY });

    const result = hooks.seeded;

    expect(result).toBeUndefined();
  });

  /**
   * With no select on the page, the note under the face's marked line is the only thing saying that
   * plugins have to be on. A page opened before the feature ever ran has no saved error, so the note has
   * to come from the plugin list. The watch shows nothing then, so no note says where its data comes from.
   */
  test('puts only the note to turn plugins on under its marked line while nothing serves the calendar', () => {
    pebble.plugins = [OTHER_PLUGIN];
    const { hooks } = startFace({ providers: ONLY });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'calendar' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line, { type: 'pluginNote', tone: 'warning', defaultValue: escapeHtml(PLUGINS_OFF_TEXT) }]);
  });

  /** With plugins off the panel at the foot already says to turn them on, so the note is not said twice. */
  test('leaves the note to turn plugins on to the panel with plugins off', () => {
    pebble.plugins = [];
    const { hooks } = startFace({ providers: ONLY });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'calendar' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line]);
  });

  /** A plugin serving the calendar needs nothing from the wearer, so the page only says where the data comes from. */
  test('adds only the source note while a plugin serves the calendar', () => {
    pebble.plugins = [BUILT_IN_CALENDAR];
    const { hooks } = startFace({ providers: ONLY });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'calendar' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line, { type: 'pluginNote', tone: 'info', defaultValue: escapeHtml(CALENDAR_TEXTS.source as string) }]);
  });
});

describe('calendar on a face built without PLUGIN_CALENDAR', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    pluginCode.off = true;
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_CALENDAR];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pluginCode.off = false;
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** Plugins are opt in, so a face that never asked gets only the plain hooks, with no page or seeded hook to change its page or its reset. */
  test('gives the plain hooks when the plugin code is off', () => {
    const { hooks } = startFace();

    const result = Object.keys(hooks);

    expect(result).toEqual(['requests', 'ready', 'message', 'refresh', 'configOpened', 'configSaved']);
  });

  /** A saved plugin from a build that had the define has to fall back to the link, never to a subscription the face has no code for. */
  test('fetches and never subscribes even with the plugin saved', () => {
    saveSettings({ CALENDAR_SOURCE: 'plugin', CALENDAR_ICS_URL: FEED_URL });
    const { hooks } = startFace({ providers: { calendar: ['plugin'] } });

    hooks.ready?.();

    expect(fetches).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(0);
  });

  /** The hold is for faces that can read a plugin, so a face without the define clears the agenda whenever it has no link. */
  test('sends an empty strip for an iCal round with no link even with nothing saved', () => {
    const { sends } = startFace({ ready: true });

    expect(sends).toEqual([{ CALENDAR_STRIP: [0] }]);
  });
});
