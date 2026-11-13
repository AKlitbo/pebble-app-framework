/**
 * Writes the C header a dev build compiles its harness from, out of the face's switches in the unit's
 * paf.dev.config.json.
 *
 * The header holds the pinned date, the settings applied at launch, the store readings that take the
 * fixture's place, and the steps of a walk the file lays out as a list. The build writes it into each
 * sandbox's page/ folder as dev_harness.h, beside settings_page.h, and only the dev plugin's
 * dev_config.c includes it, inside `#if DEV_MODE`. A build without `--dev` takes the header away, so a
 * release never builds against one an earlier dev build left.
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
import { checkStoresFit, type DevStores, type HealthSeed, type WeatherSeed } from './dev-seeds.ts';
import { checkSettingKeys, dictSize, type DevValue } from './dev-settings.ts';
import { panelSteps, type DevStep, type PanelStep } from './dev-walks.ts';
import type { DevSwitches } from './dev-switches.ts';

/** Where the header sits in a sandbox, beside the settings page's header on the include path. */
export const DEV_HEADER = path.join('page', 'dev_harness.h');

/** The C name each HRV state takes. */
const HRV_STATE_NAMES = { still: 'HRV_STATE_STILL', busy: 'HRV_STATE_BUSY', walking: 'HRV_STATE_WALKING' };

/** The minutes of heart rate the store's last hour holds, which a shorter curve is padded up to. */
const HR_HISTORY_SLOTS = 60;

/** A walk the file lays out, resolved into what the watch steps through. */
export type ResolvedWalk = { kind: 'panels'; steps: PanelStep[] } | { kind: 'steps'; steps: DevStep[] } | null;

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

/**
 * Works out the steps of the walk the switches pick, when it is one the file lays out.
 *
 * @param switches The face's switches.
 * @param facts The face, its keys, and its thumbnails.
 * @return The walk's steps, or null for the theme walk, a face's own walk, or none.
 */
export function resolveWalk(switches: DevSwitches, facts: HeaderFacts): ResolvedWalk {
  const name = switches.walk;
  const walk = name !== null && Object.prototype.hasOwnProperty.call(switches.walks, name) ? switches.walks[name] : null;

  if (walk === null) {
    return null;
  }

  if (walk.kind === 'steps') {
    walk.steps.forEach((step, index) => checkSettingKeys(step.settings, facts.keys, facts.face, `walks.${name}.steps[${index}].settings`));
    return { kind: 'steps', steps: completeSteps(walk.steps, switches.settings, facts.face, name as string) };
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

/** The lines for the weather seed. */
function weatherLines(seed: WeatherSeed): string[] {
  const lines = ['#define DEV_CONFIG_SEEDS_WEATHER 1'];
  const fills: string[] = [];
  const numbers: [keyof WeatherSeed, string][] = [
    ['temp', 'temp'], ['humidity', 'humidity'], ['windKmh', 'wind_kmh'], ['sunrise', 'sunrise'], ['sunset', 'sunset'], ['uv', 'uv'],
    ['tempMax', 'temp_max'], ['tempMin', 'temp_min'], ['precipChance', 'precip_chance'], ['feelsLike', 'feels_like'], ['pressure', 'pressure'], ['dewPoint', 'dew_point'],
  ];

  for (const [field, member] of numbers) {
    if (seed[field] !== null) {
      fills.push(`    seed->${member} = ${seed[field]};`);
    }
  }

  const texts: [keyof WeatherSeed, string][] = [['cond', 'cond'], ['condLabel', 'cond_label'], ['windDir', 'wind_dir']];

  for (const [field, member] of texts) {
    if (seed[field] !== null) {
      fills.push(`    seed->${member} = ${cString(seed[field] as string)};`);
    }
  }

  if (seed.hourly) {
    const columns = seed.hourly.columns.map((column) => `{ ${column.code}, ${column.temp} }`).join(', ');

    lines.push(`static const WeatherHourly s_dev_hourly = { .count = ${seed.hourly.columns.length}, .base_hour = ${seed.hourly.baseHour}, .step_hours = ${seed.hourly.stepHours}, .col = { ${columns} } };`);
    fills.push('    seed->forecast_hourly = &s_dev_hourly;');
  }

  if (seed.daily) {
    const columns = seed.daily.columns.map((column) => `{ ${column.code}, ${column.high}, ${column.low} }`).join(', ');

    lines.push(`static const WeatherDaily s_dev_daily = { .count = ${seed.daily.columns.length}, .base_weekday = ${seed.daily.baseWeekday}, .col = { ${columns} } };`);
    fills.push('    seed->forecast_daily = &s_dev_daily;');
  }

  return [
    ...lines,
    '',
    '/** @brief Sets the readings the config gives on a seed that starts with none. */',
    'static void dev_config_weather(WeatherSeed *seed)',
    '{',
    ...(fills.length > 0 ? fills : ['    (void)seed;']),
    '}',
  ];
}

/** The lines for the health seed. */
function healthLines(seed: HealthSeed): string[] {
  const lines = ['#define DEV_CONFIG_SEEDS_HEALTH 1'];
  const value = (reading: number | null, none: number): number => (reading === null ? none : reading);

  if (seed.hrHistory) {
    // the store keeps the last hour a minute a slot, newest last, so a shorter curve is the latest minutes
    const padded = [...new Array(HR_HISTORY_SLOTS - seed.hrHistory.length).fill(0), ...seed.hrHistory];

    lines.push(`static const uint8_t s_dev_hr_history[${HR_HISTORY_SLOTS}] = { ${padded.join(', ')} };`);
  }

  if (seed.stepHourly) {
    lines.push(`static const uint16_t s_dev_step_hourly[24] = { ${seed.stepHourly.join(', ')} };`);
  }

  lines.push(
    'static const HealthSeed s_dev_health = {',
    `    .hr = ${value(seed.hr, -1)}, .steps = ${value(seed.steps, -1)}, .calories = ${value(seed.calories, -1)},`,
    `    .sleep_min = ${value(seed.sleepMin, -1)}, .active_min = ${value(seed.activeMin, -1)}, .distance_m = ${value(seed.distanceM, 0)},`,
    `    .hr_history = ${seed.hrHistory ? 's_dev_hr_history' : 'NULL'}, .step_hourly = ${seed.stepHourly ? 's_dev_step_hourly' : 'NULL'}, .step_hours = ${seed.stepHourly ? seed.stepHourly.length : 0},`,
    `    .hrv_ms = ${value(seed.hrvMs, 0)},`,
    '};'
  );

  if (seed.hrDay) {
    const pairs = seed.hrDay.flatMap((readings, hour) => readings.map((bpm) => `{ ${hour}, ${bpm} }`));

    lines.push(`#define DEV_CONFIG_HR_DAY_COUNT ${pairs.length}`, ...table('DevHourReading', 's_dev_hr_day', pairs.map((pair) => `    ${pair},`), '{ 0, 0 }'));
  }

  if (seed.hrvLog) {
    const rows = seed.hrvLog.map((reading) => `    { ${reading.minute}, ${reading.ms}, ${HRV_STATE_NAMES[reading.state]}, ${reading.asleep} },`);

    lines.push(`#define DEV_CONFIG_HRV_COUNT ${rows.length}`, ...table('DevHrvReading', 's_dev_hrv_log', rows, '{ 0, 0, HRV_STATE_STILL, false }'));
  }

  return lines;
}

/** The lines for every store the config seeds. */
function storeLines(stores: DevStores): string[] {
  const lines: string[] = [];

  if (stores.weather) {
    lines.push(...weatherLines(stores.weather), '');
  }

  if (stores.health) {
    lines.push(...healthLines(stores.health), '');
  }

  if (stores.system) {
    const system = stores.system;

    lines.push(
      '#define DEV_CONFIG_SEEDS_SYSTEM 1',
      `#define DEV_CONFIG_ALARM_IN_MIN ${system.alarmIn ?? 0}`,
      `static const SystemSeed s_dev_system = { .battery = ${system.battery}, .charging = ${system.charging}, .bluetooth = ${system.bluetooth}, .next_alarm = 0 };`,
      ''
    );
  }

  if (stores.phone) {
    lines.push('#define DEV_CONFIG_SEEDS_PHONE 1', `static const PhoneSeed s_dev_phone = { .battery = ${stores.phone.battery} };`, '');
  }

  if (stores.music) {
    const music = stores.music;

    lines.push('#define DEV_CONFIG_SEEDS_MUSIC 1', `static const MusicSeed s_dev_music = { .title = ${cString(music.title)}, .artist = ${cString(music.artist)}, .playing = ${music.playing} };`, '');
  }

  if (stores.stocks) {
    const slots = stores.stocks.map((quote) => `        { ${cString(quote.symbol)}, ${quote.priceCents}, ${quote.changeHundredths}, ${quote.ok} },`);

    lines.push('#define DEV_CONFIG_SEEDS_STOCKS 1', `static const StockStrip s_dev_stocks = {`, `    .count = ${slots.length},`, '    .slot = {', ...slots, '    },', '};', '');
  }

  if (stores.calendar) {
    const rows = stores.calendar.map((event) => `    { ${cString(event.title)}, ${cString(event.location)}, ${event.allDay}, ${event.inMinutes}, ${event.minutes}, ${event.inDays} },`);

    lines.push('#define DEV_CONFIG_SEEDS_CALENDAR 1', `#define DEV_CONFIG_EVENT_COUNT ${rows.length}`, ...table('DevEvent', 's_dev_events', rows, '{ "", "", false, 0, 0, 0 }'), '');
  }

  if (stores.location) {
    lines.push('#define DEV_CONFIG_SEEDS_LOCATION 1', `static const LocationSeed s_dev_location = { .lat = ${cString(stores.location.lat)}, .lon = ${cString(stores.location.lon)} };`, '');
  }

  return lines;
}

/**
 * Every settings block a dev build applies: the launch settings, and each step of the picked walk
 * when it is a step walk. The build checks each against the face's settings page once the page is read.
 *
 * @param switches The face's switches for a dev build.
 * @return Each block, with where it sits in the file.
 */
export function appliedSettings(switches: DevSwitches): Array<{ where: string; settings: Record<string, DevValue> }> {
  const name = switches.walk;
  const walk = name !== null && Object.prototype.hasOwnProperty.call(switches.walks, name) ? switches.walks[name] : null;
  const steps = walk?.kind === 'steps' ? walk.steps.map((step, index) => ({ where: `walks.${name}.steps[${index}].settings`, settings: step.settings })) : [];

  return [{ where: 'settings', settings: switches.settings }, ...steps];
}

/**
 * Makes every step of a step walk stand on its own, so a tap onto any step draws the same screen
 * whichever step came before it, and the tap after the last comes back to exactly the first screen.
 *
 * Each step applies every setting the walk touches. A setting it leaves out takes the launch setting,
 * or the first step's value when the launch settings leave the key out too, since the watch's own saved
 * value is not known here. A step with no layout shows the layout of the step before it, so the first
 * step needs one when any step has one. A key the walk touches that neither the launch settings nor the
 * first step sets stops the build, since the walk would have nothing to put back.
 *
 * @param steps The walk's steps as the file writes them.
 * @param launch The settings the face starts on.
 * @param face The face, which a refusal names.
 * @param name The walk's name, which a refusal names.
 * @return The steps, each with every setting the walk touches and its layout.
 */
export function completeSteps(steps: DevStep[], launch: Record<string, DevValue>, face: string, name: string): DevStep[] {
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

/** The lines for the walk, and the biggest dictionary one of its steps needs. */
function walkLines(walk: ResolvedWalk, panelHeaders: string[]): { lines: string[]; dict: number } {
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

  const settings: string[] = [];
  const steps: string[] = [];
  let dict = 0;

  for (const step of walk.steps) {
    const entries = Object.entries(step.settings);

    steps.push(`    { ${settings.length}, ${entries.length}, ${step.layout === null ? 'NULL' : cString(step.layout)} },`);
    settings.push(...entries.map(([key, value]) => settingRow(key, value)));
    dict = Math.max(dict, dictSize(step.settings));
  }

  return {
    lines: [
      '#define DEV_CONFIG_WALK_STEPS 1',
      `#define DEV_CONFIG_WALK_COUNT ${steps.length}`,
      ...table('DevSetting', 's_dev_step_settings', settings, '{ NULL, DEV_VALUE_NUMBER, 0, NULL }'),
      ...table('DevStep', 's_dev_steps', steps, '{ 0, 0, NULL }'),
    ],
    dict,
  };
}

/** A minute of the day as `HH:MM`. */
function clockText(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/**
 * Refuses an HRV log that runs past the clock the build pins.
 *
 * The watch dates each reading back from the pinned clock, so one after it would land in the future.
 * A face's log is checked against its own clock when the file is read, and a walk that pins an earlier
 * clock of its own needs a health store of its own.
 */
function checkHrvClock(switches: DevSwitches, face: string): void {
  const clock = switches.hour * 60 + switches.minute;
  const late = switches.stores.health?.hrvLog?.find((reading) => reading.minute > clock);

  if (late) {
    throw new ToolError(`paf.dev.config.json pins ${face}'s clock at ${clockText(clock)}, but its HRV log has a reading at ${clockText(late.minute)}. Give the walk that pins the earlier clock a health store of its own`);
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
  checkStoresFit(switches.stores, facts.keys, facts.defines, facts.face);
  checkHrvClock(switches, facts.face);

  const walk = resolveWalk(switches, facts);
  const launch = Object.entries(switches.settings);
  const walked = walkLines(walk, switches.panels?.include ?? []);
  const date = switches.date;

  return [
    '// written by paf build --dev from the unit\'s paf.dev.config.json, and taken away by a build without it',
    `// the dev plugin's dev_config.c is the only file that includes it, so edit the config rather than this`,
    '#pragma once',
    '#include "dev/dev_config.h"',
    '',
    `#define DEV_CONFIG_FINGERPRINT "${harnessFingerprint(switches, walk)}" ///< what this build shows, which the thumbnails tool checks against the config`,
    '',
    ...(date
      ? [
        '#define DEV_CONFIG_HAS_DATE 1',
        `#define DEV_CONFIG_YEAR ${date.year - 1900} ///< years since 1900, as a struct tm counts them`,
        `#define DEV_CONFIG_MONTH ${date.month - 1} ///< 0 for January`,
        `#define DEV_CONFIG_DAY ${date.day}`,
        `#define DEV_CONFIG_WEEKDAY ${date.weekday} ///< 0 for Sunday`,
        `#define DEV_CONFIG_YEAR_DAY ${date.yearDay} ///< 0 for the first of January`,
        '',
      ]
      : []),
    `#define DEV_CONFIG_SETTING_COUNT ${launch.length}`,
    ...table('DevSetting', 's_dev_settings', launch.map(([key, value]) => settingRow(key, value)), '{ NULL, DEV_VALUE_NUMBER, 0, NULL }'),
    `#define DEV_CONFIG_DICT_SIZE ${Math.max(1, dictSize(switches.settings), walked.dict)}`,
    '',
    ...storeLines(switches.stores),
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
