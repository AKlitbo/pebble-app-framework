// @vitest-environment jsdom
/**
 * Specs for the Clay location-search component.
 *
 * The component runs inside Clay's config webview, so its logic is pure DOM:
 * restoring a saved selection, debouncing the geocoder, rendering suggestions
 * safely, and persisting the chosen coordinates. A regression here either loses
 * the user's location or, worse, injects markup from an attacker-named place.
 *
 * The webview globals are provided by jsdom. The main suite stubs
 * XMLHttpRequest so the geocoder is never actually hit and the timing stays
 * deterministic. The opt-in live block (RUN_LIVE_WEATHER=1) hits the real API.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import component from './location-component';
import type { ClayComponentContext } from './location-component';
import { fetchRequest } from '../testing/fetch-request';

/** The context Clay binds to, plus the handles the specs drive the component through. */
interface MountedContext extends ClayComponentContext {
  set(value: string): void;
  get(): string;
  initialize(): void;
}

/**
 * Builds a component the way Clay does.
 *
 * A root from the template, with set/get/initialize bound to a context
 * exposing $element and config. Returns that context and the elements
 * the specs assert against.
 */
function mount(config?: ClayComponentContext['config']) {
  const holder = document.createElement('div');
  holder.innerHTML = component.template;
  const root = holder.firstChild as HTMLElement;

  const ctx = { $element: [root], config: config || {} } as MountedContext;
  ctx.set = component.manipulator.set.bind(ctx);
  ctx.get = component.manipulator.get.bind(ctx);
  ctx.initialize = component.initialize.bind(ctx);

  return {
    ctx,
    root,
    query: root.querySelector('.loc-query') as HTMLInputElement,
    hidden: root.querySelector('.loc-value') as HTMLInputElement,
    list: root.querySelector('.loc-list') as HTMLElement,
    note: root.querySelector('.loc-note') as HTMLElement,
  };
}

/**
 * Captures every XMLHttpRequest the component opens, so a spec can inspect the url and hand
 * back a canned geocoder response without touching the network. Returns the list of requests
 * sent so far, in the order they were opened.
 */
function installFakeXhr() {
  const sent: FakeXhr[] = [];

  class FakeXhr {
    method = '';
    url = '';
    status = 0;
    responseText = '';
    // the component hangs these on the request, so the fake has to model them
    onload?: () => void;
    onerror?: () => void;

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    send() {
      sent.push(this);
    }

    /**
     * Drives the response the component is waiting on.
     */
    respond(body: string, status?: number) {
      this.status = status === undefined ? 200 : status;
      this.responseText = body;
      if (this.onload) {
        this.onload();
      }
    }

    /**
     * Drives a network failure the component is waiting on.
     */
    error() {
      if (this.onerror) {
        this.onerror();
      }
    }
  }

  global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  return sent;
}

/**
 * Types into the search box exactly as a user would.
 *
 * Sets the value, then fires input.
 */
function type(query: HTMLInputElement, text: string): void {
  query.value = text;
  query.dispatchEvent(new Event('input'));
}

describe('Clay serialisation safety', () => {
  /**
   * Clay serialises a registered component by writing each key followed by the function's own
   * toString, so a shorthand method comes out as `initialize:initialize() {` and stops the whole
   * settings page parsing. Every component on the page shares that fate, so the symptom is a
   * config screen that never opens at all.
   */
  test.each([
    ['initialize', component.initialize],
    ['manipulator.set', component.manipulator.set],
    ['manipulator.get', component.manipulator.get],
  ])('declares %s as an anonymous function expression', (_name, fn) => {
    const result = String(fn);

    expect(result).toMatch(/^function\s*\(/);
  });
});

describe('manipulator', () => {
  /** A saved selection must repopulate the box and round-trip its JSON, else the watch loses the chosen place. */
  test('restores the saved label and persists the value verbatim', () => {
    const { ctx, query, hidden } = mount();
    const saved = JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix, Arizona, United States' });

    ctx.set(saved);

    expect(query.value).toBe('Phoenix, Arizona, United States');
    expect(hidden.value).toBe(saved);
    expect(ctx.get()).toBe(saved);
  });

  /** Corrupt saved data must not throw and must leave the box empty, never printing garbage into it. */
  test('leaves the search box empty on malformed saved data', () => {
    const { ctx, query } = mount();

    const attemptSet = () => ctx.set('not json');

    expect(attemptSet).not.toThrow();
    expect(query.value).toBe('');
  });

  /** The timezone field persists as "offset,label", so reopening config must show the place name and not the raw "60,Berlin". */
  test('restores just the place name from an offset,label timezone value', () => {
    const { ctx, query } = mount();

    ctx.set('60,Europe/Berlin');

    expect(query.value).toBe('Europe/Berlin');
  });

  /** The zone has to survive being persisted, or the pkjs side has nothing to read a fresh offset off and the watch drifts an hour every summer. */
  test('keeps the saved zone in what a timezone field persists', () => {
    const { ctx, hidden } = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    const blob = JSON.stringify({ lat: 52.5, lon: 13.4, label: 'Berlin', offset: 60, tz: 'Europe/Berlin' });
    hidden.value = blob;

    const result = ctx.get();

    expect(result).toBe(blob);
  });

  /**
   * A place saved before the zone was kept has only the offset it had that day, so its clock goes
   * an hour out when the clocks change. Picking the city again is the fix, so the picker says so.
   */
  test('prompts to pick again when a restored timezone value carries no zone', () => {
    const { ctx, note } = mount({ messageKey: 'CLOCK_TIMEZONE_1' });

    ctx.set('0,London, England, United Kingdom');

    expect(note.style.display).toBe('block');
  });

  /** A blob whose zone lookup never came back is the same problem wearing a different shape. */
  test('prompts to pick again when a saved place has no zone in it', () => {
    const { ctx, note } = mount({ messageKey: 'CLOCK_TIMEZONE_1' });

    ctx.set(JSON.stringify({ lat: 51.5, lon: -0.1, label: 'London', offset: 0 }));

    expect(note.style.display).toBe('block');
  });

  /** Nagging somebody whose clock is already right would teach them to ignore the prompt. */
  test('stays quiet when the saved place carries its zone', () => {
    const { ctx, note } = mount({ messageKey: 'CLOCK_TIMEZONE_1' });

    ctx.set(JSON.stringify({ lat: 51.5, lon: -0.1, label: 'London', offset: 0, tz: 'Europe/London' }));

    expect(note.style.display).toBe('none');
  });

  /** A weather location needs no zone, so it must never carry a prompt about one. */
  test('stays quiet for a location field that is not a timezone', () => {
    const { ctx, note } = mount({ messageKey: 'LOCATION_NAME' });

    ctx.set(JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix', offset: 0 }));

    expect(note.style.display).toBe('none');
  });

  /** An empty field has nothing to pick again, so a prompt there is just noise. */
  test('stays quiet when nothing is saved yet', () => {
    const { ctx, note } = mount({ messageKey: 'CLOCK_TIMEZONE_1' });

    ctx.set('');

    expect(note.style.display).toBe('none');
  });

  /** A plain location field carries coordinates the weather fetch needs, so its blob has to come back whole. */
  test('returns the raw json blob for a non-timezone location key', () => {
    const { ctx, hidden } = mount({ messageKey: 'LOCATION_NAME' });
    const blob = JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix', offset: 0 });
    hidden.value = blob;

    const result = ctx.get();

    expect(result).toBe(blob);
  });
});

describe('initialize', () => {
  let xhrs: ReturnType<typeof installFakeXhr>;

  beforeEach(() => {
    vi.useFakeTimers();
    xhrs = installFakeXhr();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A 1-char query would spam the geocoder on every keystroke and show a stale dropdown. */
  test('makes no request for queries shorter than 2 chars', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'P');
    vi.advanceTimersByTime(300);

    expect(xhrs).toHaveLength(0);
    expect(mounted.list.classList.contains('show')).toBe(false);
  });

  /** A missed debounce floods the API, and a wrong endpoint geocodes against the wrong service. */
  test('debounces 300ms then queries the Open-Meteo geocoder with the typed term', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(299);

    expect(xhrs).toHaveLength(0);

    vi.advanceTimersByTime(1);

    expect(xhrs).toHaveLength(1);
    expect(xhrs[0].url).toContain('geocoding-api.open-meteo.com');
    expect(xhrs[0].url).toContain('name=Phoenix');
    expect(xhrs[0].url).toContain('count=5');
  });

  /** A place name containing HTML must render as inert text, never inject markup into the config page. */
  test('renders suggestions as text, not markup', () => {
    const evil = '<img src=x onerror=alert(1)>';

    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'evil');
    vi.advanceTimersByTime(300);

    xhrs[0].respond(JSON.stringify({ results: [{ name: evil, latitude: 1, longitude: 2 }] }));

    const images = mounted.list.querySelectorAll('img');
    const text = mounted.list.querySelector('.loc-item').textContent;

    expect(images).toHaveLength(0);
    expect(text).toBe(evil);
  });

  /** A mis-joined label shows the wrong place or a comma-littered string when parts are missing. */
  test('formats the label as name, admin1, country and drops missing parts', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'city');
    vi.advanceTimersByTime(300);

    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Phoenix', admin1: 'Arizona', country: 'United States', latitude: 1, longitude: 2 },
      { name: 'Berlin', latitude: 3, longitude: 4 },
    ] }));

    const items = mounted.list.querySelectorAll('.loc-item');
    expect(items[0].textContent).toBe('Phoenix, Arizona, United States');
    expect(items[1].textContent).toBe('Berlin');
  });

  /** If selecting a result fails to persist its coordinates and offset, the watch loses the place or has to geocode for itself. */
  test('persists the chosen coordinates, label, and resolved offset on selection', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Phoenix', admin1: 'Arizona', country: 'United States', latitude: 33.4, longitude: -112 },
    ] }));

    mounted.list.querySelector('.loc-item').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    xhrs[1].respond(JSON.stringify({ utc_offset_seconds: 3600, timezone: 'America/Phoenix' }));

    const saved = JSON.parse(mounted.hidden.value);

    expect(xhrs[1].url).toContain('api.open-meteo.com/v1/forecast');
    expect(saved).toEqual({
      lat: 33.4,
      lon: -112,
      label: 'Phoenix, Arizona, United States',
      offset: 60,
      tz: 'America/Phoenix',
    });
    expect(mounted.query.value).toBe('Phoenix, Arizona, United States');
    expect(mounted.list.classList.contains('show')).toBe(false);
    // a prompt still showing after the pick that answers it reads as a page that ignored them
    expect(mounted.note.style.display).toBe('none');
  });

  /**
   * A place the geocoder gave no zone for only gets one from a second request. Saving in that gap
   * keeps a place with no zone, whose clock reads UTC and can never be re-read, so the prompt has
   * to be up until the zone actually lands. Typing hid it, so the tap has to put it back.
   */
  test('shows the prompt when the picked place has no zone yet', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Phoenix', admin1: 'Arizona', country: 'United States', latitude: 33.4, longitude: -112 },
    ] }));
    // the place row, since a timezone field lists America/Phoenix above it and picking that one
    // would answer the prompt outright
    mounted.list.querySelector('.loc-item:not(.loc-item-zone)').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(mounted.note.style.display).toBe('block');
  });

  /**
   * The geocoder names each place's zone. Waiting on a second request for it meant a save straight
   * after the tap, or one made offline, stored no zone, and the second clock read UTC under the
   * city's name.
   */
  test('keeps the zone the geocoder named before the lookup answers', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'Tokyo');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Tokyo', country: 'Japan', latitude: 35.7, longitude: 139.7, timezone: 'Asia/Tokyo' },
    ] }));
    mounted.list.querySelector('.loc-item:not(.loc-item-zone)').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result.tz).toBe('Asia/Tokyo');
    expect(result.offset).toBe(540);
    expect(mounted.note.style.display).toBe('none');
  });

  /** A slow lookup for the first city tapped must not write that city over the one picked after it. */
  test('ignores a zone lookup that answers after a newer pick', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Springfield');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Springfield', admin1: 'Illinois', latitude: 39.8, longitude: -89.6 },
      { name: 'Springfield', admin1: 'Missouri', latitude: 37.2, longitude: -93.3 },
    ] }));
    const items = mounted.list.querySelectorAll('.loc-item');
    items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    xhrs[2].respond(JSON.stringify({ utc_offset_seconds: -18000, timezone: 'America/Chicago' }));
    xhrs[1].respond(JSON.stringify({ utc_offset_seconds: -18000, timezone: 'America/Chicago' }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result.label).toBe('Springfield, Missouri');
  });

  /** A lookup that lands after the box was edited must not save a city the box no longer shows. */
  test('ignores a zone lookup that answers after the query was edited', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Springfield');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [
      { name: 'Springfield', admin1: 'Illinois', latitude: 39.8, longitude: -89.6 },
    ] }));
    mounted.list.querySelector('.loc-item').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    type(mounted.query, 'Spr');
    xhrs[1].respond(JSON.stringify({ utc_offset_seconds: -18000, timezone: 'America/Chicago' }));

    const result = mounted.hidden.value;

    expect(result).toBe('');
  });

  /** Editing the query after a selection must drop the stored coordinates, so the watch never saves a label that disagrees with its lat/lon. */
  test('clears the stored coordinates when the query is edited', () => {
    const mounted = mount();
    mounted.ctx.initialize();
    mounted.hidden.value = JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix' });

    type(mounted.query, 'Phoeni');

    expect(mounted.hidden.value).toBe('');
  });

  /** Rapid keystrokes must collapse into one request, not one per character that floods the geocoder. */
  test('coalesces rapid keystrokes into a single request', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Ph');
    vi.advanceTimersByTime(200);

    type(mounted.query, 'Pho');
    vi.advanceTimersByTime(300);

    expect(xhrs).toHaveLength(1);
    expect(xhrs[0].url).toContain('name=Pho');
  });

  /** A slower earlier request resolving last must not overwrite the latest query's suggestions, or the user persists the wrong city. */
  test('ignores a stale response that resolves after a newer query', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Pho');
    vi.advanceTimersByTime(300);

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(300);

    // the newer "Phoenix" request resolves first then the stale "Pho" one lands
    xhrs[1].respond(JSON.stringify({ results: [{ name: 'Phoenix', latitude: 1, longitude: 2 }] }));
    xhrs[0].respond(JSON.stringify({ results: [{ name: 'Phonsavan', latitude: 3, longitude: 4 }] }));

    const items = mounted.list.querySelectorAll('.loc-item');

    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe('Phoenix');
  });

  /** A network failure must hide the list rather than leave a stale dropdown or throw. */
  test('hides the list when the geocoder request errors', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(300);

    const fail = () => xhrs[0].error();

    expect(fail).not.toThrow();
    expect(mounted.list.classList.contains('show')).toBe(false);
  });

  /** Clicking outside the component must dismiss the dropdown, else a stale suggestion list lingers over the rest of the config webview. */
  test('dismisses the dropdown when clicking outside the component', () => {
    const mounted = mount();
    mounted.ctx.initialize();

    type(mounted.query, 'Phoenix');
    vi.advanceTimersByTime(300);

    xhrs[0].respond(JSON.stringify({ results: [{ name: 'Phoenix', latitude: 1, longitude: 2 }] }));

    expect(mounted.list.classList.contains('show')).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(mounted.list.classList.contains('show')).toBe(false);
  });
});

/**
 * Zone rows on a timezone field.
 *
 * The geocoder only knows populated places, so before these rows existed there was no way to pick
 * UTC at all. The cases worth pinning are the ones a reader cannot check by eye: which words reach
 * UTC, the inverted sign on the Etc zones, and that none of this leaks into the weather location
 * field or takes the city search away.
 */
describe('zone search', () => {
  let xhrs: ReturnType<typeof installFakeXhr>;

  beforeEach(() => {
    vi.useFakeTimers();
    xhrs = installFakeXhr();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** The rows a query put up, as the text of each one. */
  function zoneRows(mounted: ReturnType<typeof mount>): string[] {
    const items = mounted.list.querySelectorAll('.loc-item-zone');
    return Array.prototype.map.call(items, (item: HTMLElement) => item.firstChild.textContent) as string[];
  }

  /** The whole point. No city is called UTC, so without this row the watch can never show it. */
  test('offers UTC for a query of utc', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc');

    const result = zoneRows(mounted);

    expect(result[0]).toBe('UTC');
  });

  /** The word the user asked for. Zulu is not a zone name, so nothing would match it on its own. */
  test('offers UTC for a query of zulu', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'zulu');

    const result = zoneRows(mounted);

    expect(result[0]).toBe('UTC');
  });

  /** The zones need nothing from the network, so a config page opened offline still reaches UTC. */
  test('shows the zone rows before the geocoder has been asked', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc');

    expect(xhrs).toHaveLength(0);
    expect(mounted.list.classList.contains('show')).toBe(true);
  });

  /** A zone that saved no tz would be stuck on today's offset, which is the bug the zone is for. */
  test('persists the zone and its label on picking UTC', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc');
    mounted.list.querySelector('.loc-item-zone').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result).toEqual({ label: 'UTC', offset: 0, tz: 'UTC', fixed: false });
    expect(xhrs).toHaveLength(0);
  });

  /**
   * Etc zone names run the sign the other way round, so UTC+5 is Etc/GMT-5. Getting it backwards
   * puts the alternate clock ten hours out and looks like a plausible zone name either way.
   */
  test('stores a whole hour offset as the Etc zone with the sign inverted', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc+5');
    mounted.list.querySelector('.loc-item-zone').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result).toEqual({ label: 'UTC+05:00', offset: 300, tz: 'Etc/GMT-5', fixed: false });
  });

  /** West of UTC flips it the other way, and a reversed pair here is the same ten hour error. */
  test('stores a western whole hour offset as an Etc zone too', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'gmt-8');
    mounted.list.querySelector('.loc-item-zone').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result).toEqual({ label: 'UTC-08:00', offset: -480, tz: 'Etc/GMT+8', fixed: false });
  });

  /** There is no Etc zone for a half hour, so the minutes stand alone and fixed says that is meant. */
  test('stores a half hour offset as minutes with no zone', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc+5:30');
    mounted.list.querySelector('.loc-item-zone').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result).toEqual({ label: 'UTC+05:30', offset: 330, tz: '', fixed: true });
  });

  /**
   * A fixed offset has no zone on purpose and no daylight saving to follow. Nagging to pick the
   * city again would be asking for something the user cannot give.
   */
  test('raises no daylight saving prompt for a restored fixed offset', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });

    mounted.ctx.set(JSON.stringify({ label: 'UTC+05:30', offset: 330, tz: '', fixed: true }));

    expect(mounted.note.style.display).toBe('none');
  });

  /** Picking a zone by name has to reach the watch as a word that fits, not as Australia/Adelaide. */
  test('labels a named zone with the city on the end of it', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'adelaide');
    mounted.list.querySelector('.loc-item-zone').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = JSON.parse(mounted.hidden.value);

    expect(result.tz).toBe('Australia/Adelaide');
    expect(result.label).toBe('Adelaide');
  });

  /** Zones are an addition. A city search that stopped working would be a worse face than before. */
  test('still lists the geocoded cities under the zones', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'Berlin');
    vi.advanceTimersByTime(300);
    xhrs[0].respond(JSON.stringify({ results: [{ name: 'Berlin', country: 'DE', latitude: 52.5, longitude: 13.4 }] }));

    const result = mounted.list.querySelector('.loc-item:not(.loc-item-zone)');

    expect(result.textContent).toBe('Berlin, DE');
  });

  /** The weather location needs coordinates, and a row like UTC has none to give it. */
  test('offers no zones on a location field that is not a timezone', () => {
    const mounted = mount({ messageKey: 'LOCATION_NAME' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc');

    const result = zoneRows(mounted);

    expect(result).toHaveLength(0);
  });

  /** Offline is the normal way to open the config page, and UTC needs nothing from the network. */
  test('keeps the zone rows up when the geocoder request errors', () => {
    const mounted = mount({ messageKey: 'CLOCK_TIMEZONE_1' });
    mounted.ctx.initialize();

    type(mounted.query, 'utc');
    vi.advanceTimersByTime(300);
    xhrs[0].error();

    const result = zoneRows(mounted);

    expect(result[0]).toBe('UTC');
    expect(mounted.list.classList.contains('show')).toBe(true);
  });
});

/**
 * Live geocoding check against the real Open-Meteo geocoding API (no key).
 *
 * Opt-in via RUN_LIVE_WEATHER=1. Catches the upstream dropping the fields the
 * dropdown reads.
 */
describe.skipIf(process.env.RUN_LIVE_WEATHER !== '1')('live geocoding', () => {
  /**
   * Mirrors the url initialize() builds.
   *
   * Hit directly to assert the result shape.
   */
  const geocode = (query: string) => new Promise<{ results?: Array<Record<string, unknown>> }>((resolve) => {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(query) + '&count=5&language=en&format=json';
    fetchRequest(url, (err, body) => resolve(err ? null : JSON.parse(body)));
  });

  /** The dropdown renders name and stores latitude, longitude, and zone. Upstream dropping them blanks the suggestions, saves no coords, or saves a city clock as UTC. */
  test('returns results carrying the fields the dropdown reads', async () => {
    const data = await geocode('Phoenix');
    expect(Array.isArray(data && data.results)).toBe(true);

    const top = data.results[0];
    expect(typeof top.name).toBe('string');
    expect(typeof top.latitude).toBe('number');
    expect(typeof top.longitude).toBe('number');
    expect(typeof top.timezone).toBe('string');
  });
});
