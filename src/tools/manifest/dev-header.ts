/**
 * Writes the C header a dev build compiles its harness from, out of the face's switches in the unit's
 * paf.dev.config.json.
 *
 * The header holds the settings applied at launch, the clock, date, and store readings each screen
 * shows, and the steps of a walk the file lays out as a list. The build writes it into each sandbox's
 * page/ folder as dev_harness.h, beside settings_page.h, and only the dev plugin's dev_config.c includes
 * it, inside `#if DEV_MODE`. A build without `--dev` takes the header away, so a release never builds
 * against one an earlier dev build left.
 *
 * The readings go in as sets. The launch has one, and each step of a step walk has its own, made from
 * what the step sets over the walk's. Sets that come out the same are written once, and so are seeds
 * that come out the same for one store, so a walk of many steps on a few sets of readings carries only
 * those few. The watch picks a set by its place in a table, and a store's seed by its place in another.
 *
 * Everything the header names is checked against the face first. A setting on a key the face does
 * not declare, a store the face has no keys for, and a walk that names a panel with no id each stop
 * the build with a line saying which, since the C would stop on an undeclared name with nothing to
 * say where it came from, or build the seed into nothing.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeIfChanged } from '../shared/files.ts';
import { ToolError } from '../shared/tool-error.ts';
import { STORE_NAMES, checkStoresFit, type DevStores, type EventSeed, type HealthSeed, type StockSeed, type SystemSeed, type WeatherSeed } from './dev-seeds.ts';
import { clockText } from './dev-fields.ts';
import { checkSettingKeys, dictSize, type DevValue } from './dev-settings.ts';
import { panelSteps, type DevEach, type PanelStep } from './dev-walks.ts';
import { pickedWalk, withStepScene, type DevDate, type DevSwitches } from './dev-switches.ts';

/** Where the header sits in a sandbox, beside the settings page's header on the include path. */
export const DEV_HEADER = path.join('page', 'dev_harness.h');

/** The C name each HRV state takes. */
const HRV_STATE_NAMES = { still: 'HRV_STATE_STILL', busy: 'HRV_STATE_BUSY', walking: 'HRV_STATE_WALKING' };

/** The minutes of heart rate the store's last hour holds, which a shorter curve is padded up to. */
const HR_HISTORY_SLOTS = 60;

/** How many sets of readings, and seeds for one store, the watch can pick from. It picks by a byte, and 255 marks none. */
const MAX_PICKS = 255;

/** How many screens a walk can step through, since the watch counts its place in a uint16_t. */
const MAX_SCREENS = 65535;

/** The clock, date, and store readings one screen shows. */
export type DevReadings = {
  /** The pinned clock, as minutes past midnight. */
  minute: number;
  /** The pinned date, or null to take the watch's own. */
  date: DevDate | null;
  /** The readings each store takes, null for one left to the fixture. */
  stores: DevStores;
};

/** What a step walk's screen shows before its readings: its settings, and its layout or null. */
type StepScreen = { settings: Record<string, DevValue>; layout: string | null };

/** One step of a step walk, resolved into what the watch shows on it. */
export type ResolvedStep = StepScreen & { readings: DevReadings };

/** A walk the file lays out, resolved into what the watch steps through. */
export type ResolvedWalk = { kind: 'panels'; steps: PanelStep[] } | { kind: 'steps'; steps: ResolvedStep[]; each: DevEach | null } | null;

/** What the header is built from, beyond the switches. */
export type HeaderFacts = {
  /** The face, which a refusal names. */
  face: string;
  /** The face's message keys, its own and the ones its features bring. */
  keys: string[];
  /** The face's C defines. */
  defines: Record<string, number>;
  /** The file names in the face's resources/thumbnails folder, which a panel walk of all the panels steps through. */
  thumbnails: string[];
};

/**
 * Text as a C string literal.
 *
 * Every byte outside printable ASCII goes in as a three-digit octal escape, so UTF-8 text lands on the
 * watch byte for byte. A hex escape would run on into a hex digit after it.
 *
 * @param value The text.
 * @return The literal, quotes included.
 */
export function cString(value: string): string {
  let out = '"';

  for (const byte of Buffer.from(value, 'utf8')) {
    if (byte === 0x22 || byte === 0x5c) {
      out += `\\${String.fromCharCode(byte)}`;
    } else if (byte >= 0x20 && byte < 0x7f && byte !== 0x3f) {
      // a ? stays escaped too, since two of them in a row can make a trigraph
      out += String.fromCharCode(byte);
    } else {
      out += `\\${byte.toString(8).padStart(3, '0')}`;
    }
  }

  return `${out}"`;
}

/** The readings a set of switches shows. */
function readingsOf(switches: DevSwitches): DevReadings {
  return { minute: switches.hour * 60 + switches.minute, date: switches.date, stores: switches.stores };
}

/**
 * Works out the steps of the walk the switches pick, when it is one the file lays out.
 *
 * A step walk's steps each come with every setting the walk touches, from completeSteps, and with the
 * readings the step shows. A step takes its own clock, date, and stores over the walk's, and the
 * walk's over the face's.
 *
 * @param switches The face's switches, with the picked walk's own over them.
 * @param facts The face, its keys, and its thumbnails.
 * @return The walk's steps, or null for the theme walk, a face's own walk, or none.
 */
export function resolveWalk(switches: DevSwitches, facts: HeaderFacts): ResolvedWalk {
  const name = switches.walk;
  const walk = pickedWalk(switches);

  if (walk === null) {
    return null;
  }

  if (walk.kind === 'steps') {
    walk.steps.forEach((step, index) => checkSettingKeys(step.settings, facts.keys, facts.face, `walks.${name}.steps[${index}].settings`));

    if (walk.each) {
      checkSettingKeys({ [walk.each.key]: walk.each.values[0] }, facts.keys, facts.face, `walks.${name}.each`);
    }

    const steps = completeSteps(walk.steps, switches.settings, facts.face, name as string).map((step, index) => ({ ...step, readings: readingsOf(withStepScene(walk.steps[index], switches)) }));

    return { kind: 'steps', steps, each: walk.each };
  }

  if (!switches.panels) {
    throw new ToolError(`paf.dev.config.json walks ${facts.face}'s ${name} through panels, but has no panels block to say what each panel and size is. Add panels with its sizes and ids`);
  }

  const steps = panelSteps(walk.panels, switches.panels, facts.thumbnails, facts.face);

  if (steps.length === 0) {
    throw new ToolError(`paf.dev.config.json walks ${facts.face}'s ${name} through all its panels, but ${facts.face} has no thumbnails in the sizes its panels block lists. Name the panels to walk instead`);
  }

  return { kind: 'panels', steps };
}

/** The line in the header that carries the fingerprint, which the thumbnails tool reads back. */
const FINGERPRINT_LINE = /^#define DEV_CONFIG_FINGERPRINT "([0-9a-f]+)"/m;

/**
 * A short fingerprint of what a dev build shows: the clock, the date, the settings, the readings, and
 * the walk's steps as the watch takes them.
 *
 * The build writes it into the header, and the thumbnails tool works it out again from the file before
 * it installs the build. The two differ when the file changed after the build, which would put every
 * picture under the wrong name or draw it on the wrong clock.
 *
 * @param switches The face's switches for a dev build.
 * @param walk The walk's steps, from resolveWalk.
 * @return Sixteen hex digits.
 */
export function harnessFingerprint(switches: DevSwitches, walk: ResolvedWalk): string {
  const shown = { hour: switches.hour, minute: switches.minute, date: switches.date, settings: switches.settings, stores: switches.stores, walk };

  return createHash('sha256').update(JSON.stringify(shown)).digest('hex').slice(0, 16);
}

/**
 * The fingerprint a sandbox's header carries.
 *
 * @param header The header's text.
 * @return The fingerprint, or null for a header without one.
 */
export function headerFingerprint(header: string): string | null {
  return FINGERPRINT_LINE.exec(header)?.[1] ?? null;
}

/** One setting as a row of a DevSetting table. */
function settingRow(key: string, value: DevValue): string {
  return typeof value === 'number' ? `    { &MESSAGE_KEY_${key}, DEV_VALUE_NUMBER, ${value}, NULL },` : `    { &MESSAGE_KEY_${key}, DEV_VALUE_TEXT, 0, ${cString(value)} },`;
}

/** A table, with one placeholder row when it is empty, since C has no array of no entries. */
function table(type: string, name: string, rows: string[], empty: string): string[] {
  return [`static const ${type} ${name}[] = {`, ...(rows.length > 0 ? rows : [`    ${empty},`]), '};'];
}

/**
 * Each value kept once, with where each one landed among those kept. A null is kept nowhere and lands
 * on null, which is a store left to the fixture or a date left to the watch.
 */
function keepOnce<T>(values: Array<T | null>): { kept: T[]; at: Array<number | null> } {
  const places = new Map<string, number>();
  const kept: T[] = [];

  const at = values.map((value) => {
    if (value === null) {
      return null;
    }

    const key = JSON.stringify(value);
    let place = places.get(key);

    if (place === undefined) {
      place = kept.length;
      places.set(key, place);
      kept.push(value);
    }

    return place;
  });

  return { kept, at };
}

/** The lines for the weather seeds, one case of the fill function each. */
function weatherLines(seeds: WeatherSeed[]): string[] {
  const lines = ['#define DEV_CONFIG_SEEDS_WEATHER 1'];
  const cases: string[] = [];
  const numbers: [keyof WeatherSeed, string][] = [
    ['temp', 'temp'], ['humidity', 'humidity'], ['windKmh', 'wind_kmh'], ['sunrise', 'sunrise'], ['sunset', 'sunset'], ['uv', 'uv'],
    ['tempMax', 'temp_max'], ['tempMin', 'temp_min'], ['precipChance', 'precip_chance'], ['feelsLike', 'feels_like'], ['pressure', 'pressure'], ['dewPoint', 'dew_point'],
  ];
  const texts: [keyof WeatherSeed, string][] = [['cond', 'cond'], ['condLabel', 'cond_label'], ['windDir', 'wind_dir']];
  let filled = false;

  seeds.forEach((seed, which) => {
    const fills: string[] = [];

    for (const [field, member] of numbers) {
      if (seed[field] !== null) {
        fills.push(`            seed->${member} = ${seed[field]};`);
      }
    }

    for (const [field, member] of texts) {
      if (seed[field] !== null) {
        fills.push(`            seed->${member} = ${cString(seed[field] as string)};`);
      }
    }

    if (seed.hourly) {
      const columns = seed.hourly.columns.map((column) => `{ ${column.code}, ${column.temp} }`).join(', ');

      lines.push(`static const WeatherHourly s_dev_hourly_${which} = { .count = ${seed.hourly.columns.length}, .base_hour = ${seed.hourly.baseHour}, .step_hours = ${seed.hourly.stepHours}, .col = { ${columns} } };`);
      fills.push(`            seed->forecast_hourly = &s_dev_hourly_${which};`);
    }

    if (seed.daily) {
      const columns = seed.daily.columns.map((column) => `{ ${column.code}, ${column.high}, ${column.low} }`).join(', ');

      lines.push(`static const WeatherDaily s_dev_daily_${which} = { .count = ${seed.daily.columns.length}, .base_weekday = ${seed.daily.baseWeekday}, .col = { ${columns} } };`);
      fills.push(`            seed->forecast_daily = &s_dev_daily_${which};`);
    }

    filled ||= fills.length > 0;
    cases.push(`        case ${which}:`, ...fills, '            break;');
  });

  return [
    ...lines,
    '',
    '/** @brief Sets one of the config\'s weather seeds on a seed that starts with none. */',
    'static void dev_config_weather(uint8_t which, WeatherSeed *seed)',
    '{',
    ...(filled ? [] : ['    (void)seed;']),
    '    switch (which)',
    '    {',
    ...cases,
    '        default:',
    '            break;',
    '    }',
    '}',
  ];
}

/** The lines for the health seeds, a row of the DevHealth table each. */
function healthLines(seeds: HealthSeed[]): string[] {
  const lines = ['#define DEV_CONFIG_SEEDS_HEALTH 1'];
  const rows: string[] = [];
  const value = (reading: number | null, none: number): number => (reading === null ? none : reading);

  if (seeds.some((seed) => seed.hrDay)) {
    lines.push('#define DEV_CONFIG_HAS_HR_DAY 1');
  }

  if (seeds.some((seed) => seed.hrvLog)) {
    lines.push('#define DEV_CONFIG_HAS_HRV 1');
  }

  seeds.forEach((seed, which) => {
    if (seed.hrHistory) {
      // the store keeps the last hour a minute a slot, newest last, so a shorter curve is the latest minutes
      const padded = [...new Array(HR_HISTORY_SLOTS - seed.hrHistory.length).fill(0), ...seed.hrHistory];

      lines.push(`static const uint8_t s_dev_hr_history_${which}[${HR_HISTORY_SLOTS}] = { ${padded.join(', ')} };`);
    }

    if (seed.stepHourly) {
      lines.push(`static const uint16_t s_dev_step_hourly_${which}[24] = { ${seed.stepHourly.join(', ')} };`);
    }

    let hrDay = 'NULL, 0';
    let hrv = 'NULL, 0';

    // a part the config names with no readings still points at a table, so the store shows it empty
    // rather than leaving the part out
    if (seed.hrDay) {
      const pairs = seed.hrDay.flatMap((readings, hour) => readings.map((bpm) => `    { ${hour}, ${bpm} },`));

      lines.push(...table('DevHourReading', `s_dev_hr_day_${which}`, pairs, '{ 0, 0 }'));
      hrDay = `s_dev_hr_day_${which}, ${pairs.length}`;
    }

    if (seed.hrvLog) {
      const readings = seed.hrvLog.map((reading) => `    { ${reading.minute}, ${reading.ms}, ${HRV_STATE_NAMES[reading.state]}, ${reading.asleep} },`);

      lines.push(...table('DevHrvReading', `s_dev_hrv_log_${which}`, readings, '{ 0, 0, HRV_STATE_STILL, false }'));
      hrv = `s_dev_hrv_log_${which}, ${readings.length}`;
    }

    rows.push(
      '    {',
      '        {',
      `            .hr = ${value(seed.hr, -1)}, .steps = ${value(seed.steps, -1)}, .calories = ${value(seed.calories, -1)},`,
      `            .sleep_min = ${value(seed.sleepMin, -1)}, .active_min = ${value(seed.activeMin, -1)}, .distance_m = ${value(seed.distanceM, 0)},`,
      `            .hr_history = ${seed.hrHistory ? `s_dev_hr_history_${which}` : 'NULL'}, .step_hourly = ${seed.stepHourly ? `s_dev_step_hourly_${which}` : 'NULL'}, .step_hours = ${seed.stepHourly ? seed.stepHourly.length : 0},`,
      `            .hrv_ms = ${value(seed.hrvMs, 0)},`,
      '        },',
      `        ${hrDay}, ${hrv},`,
      '    },'
    );
  });

  return [...lines, ...table('DevHealth', 's_dev_health', rows, '{ { 0 }, NULL, 0, NULL, 0 }')];
}

/** The lines for the system seeds. */
function systemLines(seeds: SystemSeed[]): string[] {
  const rows = seeds.map((seed) => `    { { .battery = ${seed.battery}, .charging = ${seed.charging}, .bluetooth = ${seed.bluetooth}, .next_alarm = 0 }, ${seed.alarmIn ?? 0} },`);

  return ['#define DEV_CONFIG_SEEDS_SYSTEM 1', ...table('DevSystem', 's_dev_system', rows, '{ { 0 }, 0 }')];
}

/** The lines for the watchlist seeds, one strip each. */
function stockLines(seeds: StockSeed[][]): string[] {
  const strips = seeds.flatMap((quotes) => {
    const slots = quotes.map((quote) => `            { ${cString(quote.symbol)}, ${quote.priceCents}, ${quote.changeHundredths}, ${quote.ok} },`);

    return ['    {', `        .count = ${slots.length},`, '        .slot = {', ...slots, '        },', '    },'];
  });

  return ['#define DEV_CONFIG_SEEDS_STOCKS 1', ...table('StockStrip', 's_dev_stocks', strips, '{ 0 }')];
}

/** The lines for the agenda seeds, every event in one table and each agenda a run of it. */
function calendarLines(seeds: EventSeed[][]): string[] {
  const events: string[] = [];
  const runs: string[] = [];

  for (const agenda of seeds) {
    runs.push(`    { ${events.length}, ${agenda.length} },`);
    events.push(...agenda.map((event) => `    { ${cString(event.title)}, ${cString(event.location)}, ${event.allDay}, ${event.inMinutes}, ${event.minutes}, ${event.inDays} },`));
  }

  return ['#define DEV_CONFIG_SEEDS_CALENDAR 1', ...table('DevEvent', 's_dev_events', events, '{ "", "", false, 0, 0, 0 }'), ...table('DevRun', 's_dev_calendar', runs, '{ 0, 0 }')];
}

/** The lines for one store's seeds. */
function storeLines(name: (typeof STORE_NAMES)[number], seeds: unknown[]): string[] {
  switch (name) {
    case 'weather':
      return weatherLines(seeds as WeatherSeed[]);
    case 'health':
      return healthLines(seeds as HealthSeed[]);
    case 'system':
      return systemLines(seeds as SystemSeed[]);
    case 'phone':
      return ['#define DEV_CONFIG_SEEDS_PHONE 1', ...table('PhoneSeed', 's_dev_phone', (seeds as Array<{ battery: number }>).map((seed) => `    { .battery = ${seed.battery} },`), '{ 0 }')];
    case 'music':
      return [
        '#define DEV_CONFIG_SEEDS_MUSIC 1',
        ...table('MusicSeed', 's_dev_music', (seeds as Array<{ title: string; artist: string; playing: boolean }>).map((seed) => `    { .title = ${cString(seed.title)}, .artist = ${cString(seed.artist)}, .playing = ${seed.playing} },`), '{ 0 }'),
      ];
    case 'stocks':
      return stockLines(seeds as StockSeed[][]);
    case 'calendar':
      return calendarLines(seeds as EventSeed[][]);
    case 'location':
      return ['#define DEV_CONFIG_SEEDS_LOCATION 1', ...table('LocationSeed', 's_dev_location', (seeds as Array<{ lat: string; lon: string }>).map((seed) => `    { .lat = ${cString(seed.lat)}, .lon = ${cString(seed.lon)} },`), '{ 0 }')];
  }
}

/**
 * The lines for every set of readings, each kept once: each store's seeds, the dates, and the table of
 * sets the watch picks from, the launch's first. The face is only for a refusal to name.
 */
function readingLines(sets: DevReadings[], face: string): string[] {
  const lines: string[] = [];
  const picks = sets.map((): string[] => []);

  for (const name of STORE_NAMES) {
    const seeds = keepOnce<unknown>(sets.map((set) => set.stores[name]));

    if (seeds.kept.length > MAX_PICKS) {
      throw new ToolError(`paf.dev.config.json gives ${face}'s ${name} store ${seeds.kept.length} different seeds across its walk, and a dev build carries ${MAX_PICKS}. Share a seed between steps that can`);
    }

    seeds.at.forEach((at, index) => picks[index].push(at === null ? 'DEV_NONE' : String(at)));

    if (seeds.kept.length > 0) {
      lines.push(...storeLines(name, seeds.kept), '');
    }
  }

  const dates = keepOnce(sets.map((set) => set.date));

  if (dates.kept.length > 0) {
    const rows = dates.kept.map((date) => `    { ${date.year - 1900}, ${date.month - 1}, ${date.day}, ${date.weekday}, ${date.yearDay} }, // ${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`);

    // a struct tm counts years from 1900, months from 0, weekdays from Sunday, and days of the year
    // from the first of January, and the build works the last two out so the watch never does
    lines.push('#define DEV_CONFIG_HAS_DATE 1', ...table('DevDate', 's_dev_dates', rows, '{ 0, 0, 0, 0, 0 }'), '');
  }

  const rows = sets.map((set, index) => `    { ${set.minute}, ${dates.at[index] ?? 'DEV_NONE'}, { ${picks[index].join(', ')} } }, // ${clockText(set.minute)}`);

  return [...lines, ...table('DevReadings', 's_dev_readings', rows, '{ 0, DEV_NONE, { 0 } }')];
}

/**
 * Every settings block a dev build applies: the launch settings, each step of the picked walk when it
 * is a step walk, and each value its `each` steps through. The build checks each against the face's
 * settings page once the page is read.
 *
 * @param switches The face's switches for a dev build.
 * @return Each block, with where it sits in the file.
 */
export function appliedSettings(switches: DevSwitches): Array<{ where: string; settings: Record<string, DevValue> }> {
  const name = switches.walk;
  const walk = pickedWalk(switches);
  const steps = walk?.kind === 'steps' ? walk.steps.map((step, index) => ({ where: `walks.${name}.steps[${index}].settings`, settings: step.settings })) : [];
  const each = walk?.kind === 'steps' && walk.each ? walk.each.values.map((value) => ({ where: `walks.${name}.each`, settings: { [(walk.each as DevEach).key]: value } })) : [];

  return [{ where: 'settings', settings: switches.settings }, ...steps, ...each];
}

/**
 * Makes every step of a step walk stand on its own, so a tap onto any step draws the same screen
 * whichever step came before it, and the tap after the last comes back to exactly the first screen.
 *
 * Each step applies every setting the walk touches. A setting it leaves out takes the launch setting,
 * or the first step's value when the launch settings leave the key out too, since the watch's own saved
 * value is not known here. A step with no layout shows the layout of the step before it, so the first
 * step needs one when any step has one. A key the walk touches that neither the launch settings nor the
 * first step sets stops the build, since the walk would have nothing to put back. The setting a walk's
 * `each` steps through is set on every screen, so it is never one of them.
 *
 * @param steps The walk's steps as the file writes them.
 * @param launch The settings the face starts on.
 * @param face The face, which a refusal names.
 * @param name The walk's name, which a refusal names.
 * @return The steps, each with every setting the walk touches and its layout.
 */
export function completeSteps(steps: StepScreen[], launch: Record<string, DevValue>, face: string, name: string): StepScreen[] {
  const touched = [...new Set(steps.flatMap((step) => Object.keys(step.settings)))];
  const first = steps[0];
  const unset = touched.filter((key) => !(key in launch) && !(key in first.settings));

  if (unset.length > 0) {
    throw new ToolError(`paf.dev.config.json walks ${face}'s ${name} through ${unset.join(', ')}, which neither its settings nor the walk's first step sets, so the walk has no value to put back. Set each in settings or in the first step`);
  }

  if (first.layout === null && steps.some((step) => step.layout !== null)) {
    throw new ToolError(`paf.dev.config.json walks ${face}'s ${name} through layouts, but its first step has none, so the walk could not come back to it. Give the first step a layout`);
  }

  let layout: string | null = null;

  return steps.map((step) => {
    layout = step.layout ?? layout;

    const settings = Object.fromEntries(touched.map((key) => [key, key in step.settings ? step.settings[key] : key in launch ? launch[key] : first.settings[key]]));

    return { settings, layout };
  });
}

/**
 * The lines for the walk, and the biggest dictionary one of its screens needs. A panel walk's ids come
 * from its headers, and each step of a step walk points at its set of readings by the place given for
 * it in the table of sets.
 */
function walkLines(walk: ResolvedWalk, panelHeaders: string[], readings: number[], face: string): { lines: string[]; dict: number } {
  if (walk === null) {
    return { lines: [], dict: 0 };
  }

  if (walk.kind === 'panels') {
    return {
      lines: [
        ...panelHeaders.map((header) => `#include ${cString(header)}`),
        '#define DEV_CONFIG_WALK_PANELS 1',
        `#define DEV_CONFIG_WALK_COUNT ${walk.steps.length}`,
        ...table('DevPanel', 's_dev_panels', walk.steps.map((step) => `    { ${step.panelId}, ${step.sizeId} }, // ${step.panel}-${step.size}`), '{ 0, 0 }'),
      ],
      dict: 0,
    };
  }

  const each = walk.each;
  const screens = walk.steps.length * (each ? each.values.length : 1);

  if (screens > MAX_SCREENS) {
    throw new ToolError(`paf.dev.config.json walks ${face} through ${screens} screens, and a dev build steps through ${MAX_SCREENS}. Split the walk in two`);
  }

  const settings: string[] = [];
  const steps: string[] = [];
  let dict = 0;

  walk.steps.forEach((step, index) => {
    const entries = Object.entries(step.settings);

    steps.push(`    { ${settings.length}, ${entries.length}, ${step.layout === null ? 'NULL' : cString(step.layout)}, ${readings[index]} },`);
    settings.push(...entries.map(([key, value]) => settingRow(key, value)));

    // the value each is on goes into the same dictionary as the step's own settings
    const sizes = each ? each.values.map((value) => dictSize({ ...step.settings, [each.key]: value })) : [dictSize(step.settings)];

    dict = Math.max(dict, ...sizes);
  });

  return {
    lines: [
      '#define DEV_CONFIG_WALK_STEPS 1',
      // a face whose walk shows no layouts defines no dev_show_layout, so the call only builds when one does
      ...(walk.steps.some((step) => step.layout !== null) ? ['#define DEV_CONFIG_WALK_LAYOUTS 1'] : []),
      `#define DEV_CONFIG_WALK_COUNT ${screens}`,
      ...table('DevSetting', 's_dev_step_settings', settings, '{ NULL, DEV_VALUE_NUMBER, 0, NULL }'),
      ...table('DevStep', 's_dev_steps', steps, '{ 0, 0, NULL, 0 }'),
      ...(each ? [`#define DEV_CONFIG_EACH_COUNT ${each.values.length}`, ...table('DevSetting', 's_dev_each', each.values.map((value) => settingRow(each.key, value)), '{ NULL, DEV_VALUE_NUMBER, 0, NULL }')] : []),
    ],
    dict,
  };
}

/**
 * Refuses an HRV log that runs past the clock a screen pins.
 *
 * The watch dates each reading back from the pinned clock, so one after it would land in the future.
 * Every walk and step is checked when the file is read. This catches a face whose own entry pins an
 * earlier clock than the log it takes on from the top of the file.
 */
function checkHrvClock(readings: DevReadings, face: string): void {
  const late = readings.stores.health?.hrvLog?.find((reading) => reading.minute > readings.minute);

  if (late) {
    throw new ToolError(`paf.dev.config.json pins ${face}'s clock at ${clockText(readings.minute)}, but its HRV log has a reading at ${clockText(late.minute)}. Give the face, the walk, or the step that pins the earlier clock a health store of its own`);
  }
}

/**
 * The header's text, after checking everything it names against the face.
 *
 * @param switches The face's switches for a dev build.
 * @param facts The face, its keys, its defines, and its thumbnails.
 * @return The header, ready to write.
 */
export function renderDevHeader(switches: DevSwitches, facts: HeaderFacts): string {
  checkSettingKeys(switches.settings, facts.keys, facts.face, 'settings');

  const walk = resolveWalk(switches, facts);
  const shown = [readingsOf(switches), ...(walk?.kind === 'steps' ? walk.steps.map((step) => step.readings) : [])];

  for (const readings of shown) {
    checkStoresFit(readings.stores, facts.keys, facts.defines, facts.face);
    checkHrvClock(readings, facts.face);
  }

  // the launch's set always comes first, since the watch starts on the first set in the table
  const sets = keepOnce(shown);

  if (sets.kept.length > MAX_PICKS) {
    throw new ToolError(`paf.dev.config.json walks ${facts.face} through ${sets.kept.length} different sets of clock, date, and readings, and a dev build carries ${MAX_PICKS}. Share them between steps that can`);
  }

  const launch = Object.entries(switches.settings);
  const walked = walkLines(walk, switches.panels?.include ?? [], sets.at.slice(1) as number[], facts.face);

  return [
    '// written by paf build --dev from the unit\'s paf.dev.config.json, and taken away by a build without it',
    `// the dev plugin's dev_config.c is the only file that includes it, so edit the config rather than this`,
    '#pragma once',
    '#include "dev/dev_config.h"',
    '',
    `#define DEV_CONFIG_FINGERPRINT "${harnessFingerprint(switches, walk)}" ///< what this build shows, which the thumbnails tool checks against the config`,
    '',
    `#define DEV_CONFIG_SETTING_COUNT ${launch.length}`,
    ...table('DevSetting', 's_dev_settings', launch.map(([key, value]) => settingRow(key, value)), '{ NULL, DEV_VALUE_NUMBER, 0, NULL }'),
    `#define DEV_CONFIG_DICT_SIZE ${Math.max(1, dictSize(switches.settings), walked.dict)}`,
    '',
    ...readingLines(sets.kept, facts.face),
    '',
    ...walked.lines,
    '',
  ].join('\n');
}

/**
 * Writes the header into a sandbox for a dev build, or takes it away for any other build.
 *
 * A header whose text would not change is left alone, so its mtime does too and the dev plugin's C
 * only compiles again when the config changed.
 *
 * @param sandbox The sandbox's absolute path.
 * @param text The header from renderDevHeader, or null for a build without `--dev`.
 */
export function writeDevHeader(sandbox: string, text: string | null): void {
  const file = path.join(sandbox, DEV_HEADER);

  if (text === null) {
    fs.rmSync(file, { force: true });
    return;
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeIfChanged(file, text);
}
