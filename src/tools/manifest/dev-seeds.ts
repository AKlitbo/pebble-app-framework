/**
 * Reads the readings a dev build seeds its stores with, out of the `stores` block in a unit's
 * paf.dev.config.json.
 *
 * Each store takes the fields its C seed has, named the same way in camelCase, so `wind_kmh` in
 * `WeatherSeed` is `windKmh` here. A store the block names replaces the dev plugin's fixture for that
 * store, and a field it leaves out reads as no reading on the watch, the way a phone message that left
 * it out would. A store the block leaves out keeps the fixture.
 *
 * Every field is checked against what the store can hold, so a misspelt field, a text too long for the
 * buffer it lands in, or a weather condition the watch has no icon for stops the dev build with a line
 * naming it. The C seed would otherwise cut the text short or draw the fallback icon with nothing to say
 * why. dev-header.ts writes what this reads into the C header a dev build compiles.
 */
import vocabulary from '../../ts/weather/conditions.ts';
import { WIRE_CAPS } from '../../ts/pkjs/wire.ts';
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';
import { clockMinutes, onlyKnown, sets, type Where } from './dev-fields.ts';

/** How a reading can sit in a burst of HRV readings, by the names the config takes. */
export const HRV_STATES = ['still', 'busy', 'walking'] as const;

/** One HRV state, by its name in the config. */
export type HrvStateName = (typeof HRV_STATES)[number];

/** One hourly forecast column: the sky's wire code, night bit included, and the temperature. */
export type HourColumn = { code: number; temp: number };

/** One daily forecast column: the sky's wire code and the day's high and low. */
export type DayColumn = { code: number; high: number; low: number };

/** The weather seed. A null field reads as no reading on the watch. */
export type WeatherSeed = {
  temp: number | null;
  cond: string | null;
  condLabel: string | null;
  humidity: number | null;
  windKmh: number | null;
  windDir: string | null;
  sunrise: number | null;
  sunset: number | null;
  uv: number | null;
  tempMax: number | null;
  tempMin: number | null;
  precipChance: number | null;
  feelsLike: number | null;
  pressure: number | null;
  dewPoint: number | null;
  hourly: { baseHour: number; stepHours: number; columns: HourColumn[] } | null;
  daily: { baseWeekday: number; columns: DayColumn[] } | null;
};

/** One HRV reading, placed by its minute of the day. */
export type HrvReading = { minute: number; ms: number; state: HrvStateName; asleep: boolean };

/** The health seed. A null field reads as no reading on the watch. */
export type HealthSeed = {
  hr: number | null;
  steps: number | null;
  calories: number | null;
  sleepMin: number | null;
  activeMin: number | null;
  distanceM: number | null;
  hrvMs: number | null;
  hrHistory: number[] | null;
  stepHourly: number[] | null;
  hrDay: number[][] | null;
  hrvLog: HrvReading[] | null;
};

/** The system seed. */
export type SystemSeed = { battery: number; charging: boolean; bluetooth: boolean; alarmIn: number | null };

/** One quote on the watchlist strip. */
export type StockSeed = { symbol: string; priceCents: number; changeHundredths: number; ok: boolean };

/** One agenda event, placed against the watch's clock when the stores are seeded. */
export type EventSeed = { title: string; location: string; allDay: boolean; inMinutes: number; minutes: number; inDays: number };

/** Every store a dev build can seed from the config, each null when the config leaves it to the fixture. */
export type DevStores = {
  weather: WeatherSeed | null;
  health: HealthSeed | null;
  system: SystemSeed | null;
  phone: { battery: number } | null;
  music: { title: string; artist: string; playing: boolean } | null;
  stocks: StockSeed[] | null;
  calendar: EventSeed[] | null;
  location: { lat: string; lon: string } | null;
};

/** The names of the stores, in the order the block lists them. */
export const STORE_NAMES = ['weather', 'health', 'system', 'phone', 'music', 'stocks', 'calendar', 'location'] as const;

/** One store's name. */
export type StoreName = (typeof STORE_NAMES)[number];

/** No store seeded from the config, which is a dev build on the fixture alone. */
export const NO_STORES: DevStores = { weather: null, health: null, system: null, phone: null, music: null, stocks: null, calendar: null, location: null };

/** The weather fields that hold a whole number, with the C field each fills. */
const WEATHER_NUMBERS = ['temp', 'humidity', 'windKmh', 'uv', 'tempMax', 'tempMin', 'precipChance', 'feelsLike', 'pressure', 'dewPoint'] as const;

/** The health fields that hold a whole number. */
const HEALTH_NUMBERS = ['hr', 'steps', 'calories', 'sleepMin', 'activeMin', 'distanceM', 'hrvMs'] as const;

/** The weather condition text a seed can hold, from the store's buffers less the terminator. */
const COND_MAX = 31;
const COND_LABEL_MAX = 19;
const WIND_DIR_MAX = 3;

/** The location text a seed can hold. The store keeps it in a buffer of 16. */
const COORD_MAX = 15;

/** The longest a heart rate curve or an hour's readings can run, from the store's buffers. */
const HR_HISTORY_MAX = 60;
const DAY_HOURS = 24;

/** Weekday names a daily strip can start on, Sunday first as the watch counts them. */
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Refuses any field a store's block holds that its seed does not take, naming the ones it does. */
function seedFields(block: Record<string, unknown>, known: readonly string[], where: Where, field: string): void {
  onlyKnown(block, known, where, field, `the ${field.split('.').pop()} seed`);
}

/** A whole number in a range, or the refusal naming the field. */
function wholeNumber(value: unknown, min: number, max: number, where: Where, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ToolError(`${sets(where, field, value)}. It takes a whole number from ${min} to ${max}`);
  }

  return value;
}

/** A whole number in a range, or null when the field is left out. */
function optionalNumber(block: Record<string, unknown>, key: string, min: number, max: number, where: Where, field: string): number | null {
  return key in block ? wholeNumber(block[key], min, max, where, `${field}.${key}`) : null;
}

/** Text no longer than the buffer it lands in. */
function text(value: unknown, max: number, where: Where, field: string): string {
  if (typeof value !== 'string') {
    throw new ToolError(`${sets(where, field, value)}. It takes text`);
  }

  // the watch's buffers count bytes, so a character outside ASCII takes more than one of them
  if (Buffer.byteLength(value, 'utf8') > max) {
    throw new ToolError(`${sets(where, field, value)}, which is longer than the ${max} bytes the watch keeps`);
  }

  return value;
}

/** True or false, or the refusal. */
function flag(value: unknown, where: Where, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ToolError(`${sets(where, field, value)}. It takes true or false`);
  }

  return value;
}

/** A list, or the refusal. */
function list(value: unknown, max: number, where: Where, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ToolError(`${sets(where, field, value)}. It takes a list`);
  }

  if (value.length > max) {
    throw new ToolError(`${where.file} sets ${where.owner}${field} to ${value.length} entries, and the watch keeps ${max}`);
  }

  return value;
}

/**
 * A time of day as minutes past midnight.
 *
 * @param value The time as written, a 24-hour `HH:MM` such as "05:30".
 * @param where Where a refusal points.
 * @param field The field a refusal names.
 * @return Minutes past midnight, 0 to 1439.
 */
export function minuteOfDay(value: unknown, where: Where, field: string): number {
  const minutes = clockMinutes(value);

  if (minutes === null) {
    throw new ToolError(`${sets(where, field, value)}. It takes a 24-hour HH:MM, such as "05:30"`);
  }

  return minutes;
}

/**
 * A weather condition's wire code, with the night bit for a token ending in `_NIGHT` when night is allowed.
 *
 * The watch draws its fallback icon for a token the shared list does not hold, so a misspelt one stops
 * the build instead of showing as a question mark.
 */
function conditionCode(value: unknown, nightAllowed: boolean, where: Where, field: string): number {
  const token = typeof value === 'string' ? value : '';
  const night = nightAllowed && token.endsWith(vocabulary.NIGHT_SUFFIX);
  const base = night ? token.slice(0, -vocabulary.NIGHT_SUFFIX.length) : token;
  const index = vocabulary.conditions.findIndex((entry) => entry.token === base);

  if (index < 0) {
    const tokens = vocabulary.conditions.map((entry) => entry.token).join(', ');
    const ending = nightAllowed ? `, each with ${vocabulary.NIGHT_SUFFIX} after it for a column after dark` : '';

    throw new ToolError(`${sets(where, field, value)}, which is not a weather condition. They are ${tokens}${ending}`);
  }

  return night ? index | vocabulary.FORECAST_NIGHT_BIT : index;
}

/** A temperature the watch holds, which it keeps from -99 to 199 in either unit. */
function temperature(value: unknown, where: Where, field: string): number {
  return wholeNumber(value, -99, 199, where, field);
}

/** The hourly forecast strip, as `{ "from": 9, "every": 2, "columns": [["CLEAR", 90], ...] }`. */
function readHourly(value: unknown, where: Where, field: string): WeatherSeed['hourly'] {
  if (!isObject(value)) {
    throw new ToolError(`${sets(where, field, value)}. It takes { "from": 9, "every": 2, "columns": [["CLEAR", 21], ["RAIN_NIGHT", 18]] }`);
  }

  seedFields(value, ['from', 'every', 'columns'], where, field);

  const columns = list(value.columns, WIRE_CAPS.FORECAST_COLS_MAX, where, `${field}.columns`).map((column, index) => {
    const at = `${field}.columns[${index}]`;

    if (!Array.isArray(column) || column.length !== 2) {
      throw new ToolError(`${sets(where, at, column)}. A column takes its sky and its temperature, such as ["CLEAR", 21]`);
    }

    return { code: conditionCode(column[0], true, where, at), temp: temperature(column[1], where, at) };
  });

  return { baseHour: wholeNumber(value.from, 0, 23, where, `${field}.from`), stepHours: 'every' in value ? wholeNumber(value.every, 1, 24, where, `${field}.every`) : 1, columns };
}

/** The daily forecast strip, as `{ "from": "sat", "columns": [["CLEAR", 31, 18], ...] }`. */
function readDaily(value: unknown, where: Where, field: string): WeatherSeed['daily'] {
  if (!isObject(value)) {
    throw new ToolError(`${sets(where, field, value)}. It takes { "from": "sat", "columns": [["CLEAR", 31, 18], ["RAIN", 24, 15]] }`);
  }

  seedFields(value, ['from', 'columns'], where, field);

  const baseWeekday = WEEKDAYS.indexOf(String(value.from).toLowerCase());

  if (baseWeekday < 0) {
    throw new ToolError(`${sets(where, `${field}.from`, value.from)}. It takes the first column's weekday, one of ${WEEKDAYS.join(', ')}`);
  }

  const columns = list(value.columns, WIRE_CAPS.FORECAST_COLS_MAX, where, `${field}.columns`).map((column, index) => {
    const at = `${field}.columns[${index}]`;

    if (!Array.isArray(column) || column.length !== 3) {
      throw new ToolError(`${sets(where, at, column)}. A column takes its sky, its high, and its low, such as ["CLEAR", 31, 18]`);
    }

    return { code: conditionCode(column[0], false, where, at), high: temperature(column[1], where, at), low: temperature(column[2], where, at) };
  });

  return { baseWeekday, columns };
}

/** The weather store's seed. */
function readWeather(block: Record<string, unknown>, where: Where): WeatherSeed {
  const field = 'stores.weather';

  seedFields(block, [...WEATHER_NUMBERS, 'cond', 'condLabel', 'windDir', 'sunrise', 'sunset', 'hourly', 'daily'], where, field);

  const seed: WeatherSeed = {
    temp: null, cond: null, condLabel: null, humidity: null, windKmh: null, windDir: null, sunrise: null, sunset: null, uv: null,
    tempMax: null, tempMin: null, precipChance: null, feelsLike: null, pressure: null, dewPoint: null, hourly: null, daily: null,
  };

  for (const key of WEATHER_NUMBERS) {
    if (key in block) {
      // the temperatures share the watch's range, and the rest are counts that are never below 0
      const isTemperature = ['temp', 'tempMax', 'tempMin', 'feelsLike', 'dewPoint'].includes(key);

      seed[key] = isTemperature ? temperature(block[key], where, `${field}.${key}`) : wholeNumber(block[key], 0, key === 'pressure' ? 2000 : 999, where, `${field}.${key}`);
    }
  }

  if ('cond' in block) {
    conditionCode(block.cond, true, where, `${field}.cond`);
    seed.cond = text(block.cond, COND_MAX, where, `${field}.cond`);
  }

  seed.condLabel = 'condLabel' in block ? text(block.condLabel, COND_LABEL_MAX, where, `${field}.condLabel`) : null;
  seed.windDir = 'windDir' in block ? text(block.windDir, WIND_DIR_MAX, where, `${field}.windDir`) : null;
  seed.sunrise = 'sunrise' in block ? minuteOfDay(block.sunrise, where, `${field}.sunrise`) : null;
  seed.sunset = 'sunset' in block ? minuteOfDay(block.sunset, where, `${field}.sunset`) : null;
  seed.hourly = 'hourly' in block ? readHourly(block.hourly, where, `${field}.hourly`) : null;
  seed.daily = 'daily' in block ? readDaily(block.daily, where, `${field}.daily`) : null;

  return seed;
}

/**
 * The HRV log as runs of readings, each run `{ "from": "00:00", "every": 5, "ms": [52, 54], "state":
 * "still", "asleep": true }`, which lays its readings `every` minutes apart from `from`. A state can be
 * one name for the whole run or a list with one for each reading.
 *
 * The log files readings in the order they come, so the runs have to run in time order and stay before
 * the pinned clock, which is when the fixture's day stops.
 */
function readHrvLog(value: unknown, clockMinute: number, where: Where, field: string): HrvReading[] {
  const readings: HrvReading[] = [];

  list(value, Number.MAX_SAFE_INTEGER, where, field).forEach((run, index) => {
    const at = `${field}[${index}]`;

    if (!isObject(run)) {
      throw new ToolError(`${sets(where, at, run)}. A run takes { "from": "00:00", "every": 5, "ms": [52, 54], "state": "still" }`);
    }

    seedFields(run, ['from', 'every', 'ms', 'state', 'asleep'], where, at);

    const from = minuteOfDay(run.from, where, `${at}.from`);
    const every = 'every' in run ? wholeNumber(run.every, 1, 1440, where, `${at}.every`) : 5;
    const values = list(run.ms, 1440, where, `${at}.ms`).map((ms, slot) => wholeNumber(ms, 1, 255, where, `${at}.ms[${slot}]`));
    const states = Array.isArray(run.state) ? run.state : values.map(() => run.state ?? 'still');

    if (states.length !== values.length) {
      throw new ToolError(`${where.file} sets ${where.owner}${at}.state to ${states.length} states for ${values.length} readings. Give one state for the run or one for each reading`);
    }

    const asleep = 'asleep' in run ? flag(run.asleep, where, `${at}.asleep`) : false;

    values.forEach((ms, slot) => {
      const state = states[slot];

      if (!HRV_STATES.includes(state)) {
        throw new ToolError(`${sets(where, `${at}.state`, state)}. It takes ${HRV_STATES.join(', ')}`);
      }

      const minute = from + slot * every;
      const last = readings.length > 0 ? readings[readings.length - 1].minute : -1;

      if (minute <= last) {
        throw new ToolError(`${where.file} sets ${where.owner}${at} to start at or before the run ahead of it ends. The log takes readings in time order`);
      }

      if (minute > clockMinute) {
        throw new ToolError(`${where.file} sets ${where.owner}${at} to a reading after the pinned clock, which is when the fixture's day stops. End the runs by the clock`);
      }

      readings.push({ minute, ms, state, asleep });
    });
  });

  return readings;
}

/** The health store's seed. */
function readHealth(block: Record<string, unknown>, clockMinute: number, where: Where): HealthSeed {
  const field = 'stores.health';

  seedFields(block, [...HEALTH_NUMBERS, 'hrHistory', 'stepHourly', 'hrDay', 'hrvLog'], where, field);

  const seed: HealthSeed = {
    hr: null, steps: null, calories: null, sleepMin: null, activeMin: null, distanceM: null, hrvMs: null,
    hrHistory: null, stepHourly: null, hrDay: null, hrvLog: null,
  };

  for (const key of HEALTH_NUMBERS) {
    seed[key] = optionalNumber(block, key, key === 'hr' || key === 'hrvMs' ? 1 : 0, key === 'hr' || key === 'hrvMs' ? 255 : 9_999_999, where, field);
  }

  if ('hrHistory' in block) {
    seed.hrHistory = list(block.hrHistory, HR_HISTORY_MAX, where, `${field}.hrHistory`).map((bpm, index) => wholeNumber(bpm, 0, 255, where, `${field}.hrHistory[${index}]`));
  }

  if ('stepHourly' in block) {
    seed.stepHourly = list(block.stepHourly, DAY_HOURS, where, `${field}.stepHourly`).map((steps, index) => wholeNumber(steps, 0, 65535, where, `${field}.stepHourly[${index}]`));
  }

  if ('hrDay' in block) {
    seed.hrDay = list(block.hrDay, DAY_HOURS, where, `${field}.hrDay`).map((hour, index) =>
      list(hour, 255, where, `${field}.hrDay[${index}]`).map((bpm, slot) => wholeNumber(bpm, 1, 255, where, `${field}.hrDay[${index}][${slot}]`))
    );
  }

  if ('hrvLog' in block) {
    seed.hrvLog = readHrvLog(block.hrvLog, clockMinute, where, `${field}.hrvLog`);
  }

  return seed;
}

/** The system store's seed. The battery is needed, and the rest default to a connected watch off the charger. */
function readSystem(block: Record<string, unknown>, where: Where): SystemSeed {
  const field = 'stores.system';

  seedFields(block, ['battery', 'charging', 'bluetooth', 'alarmIn'], where, field);

  return {
    battery: wholeNumber(block.battery, 0, 100, where, `${field}.battery`),
    charging: 'charging' in block ? flag(block.charging, where, `${field}.charging`) : false,
    bluetooth: 'bluetooth' in block ? flag(block.bluetooth, where, `${field}.bluetooth`) : true,
    alarmIn: optionalNumber(block, 'alarmIn', 1, 7 * 24 * 60, where, field),
  };
}

/** The highest price the strip's int32 of cents carries. */
const PRICE_MAX = 21_474_836.47;

/** The change in percent the strip's int16 of hundredths carries. */
const CHANGE_MIN = -327.68;
const CHANGE_MAX = 327.67;

/** A number in a range, as whole hundredths, the way the strip packs a price or a change. */
function hundredths(value: unknown, min: number, max: number, where: Where, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ToolError(`${sets(where, field, value)}. It takes a number from ${min} to ${max}`);
  }

  return Math.round(value * 100);
}

/** The watchlist strip, each quote as `{ "symbol": "NVDA", "price": 1180, "change": 3.4 }`. */
function readStocks(value: unknown, where: Where): StockSeed[] {
  const field = 'stores.stocks';

  return list(value, WIRE_CAPS.STOCK_SLOTS_MAX, where, field).map((quote, index) => {
    const at = `${field}[${index}]`;

    if (!isObject(quote)) {
      throw new ToolError(`${sets(where, at, quote)}. A quote takes { "symbol": "NVDA", "price": 1180, "change": 3.4 }`);
    }

    seedFields(quote, ['symbol', 'price', 'change', 'ok'], where, at);

    const ok = 'ok' in quote ? flag(quote.ok, where, `${at}.ok`) : true;

    // the strip carries the price in cents and the change in hundredths of a percent, as the phone packs
    // them. the wire holds the cents in an int32 and the hundredths in an int16, so a quote past either
    // could never arrive from the phone, and in the C it would overflow its field
    const priceCents = hundredths(quote.price, 0, PRICE_MAX, where, `${at}.price`);
    const changeHundredths = hundredths(quote.change, CHANGE_MIN, CHANGE_MAX, where, `${at}.change`);

    return { symbol: text(quote.symbol, WIRE_CAPS.STOCK_LABEL_MAX, where, `${at}.symbol`), priceCents, changeHundredths, ok };
  });
}

/**
 * The agenda, each event `{ "title": "Dentist", "inMinutes": 60, "minutes": 30 }` or, for an all-day one,
 * `{ "title": "Birthday", "allDay": true, "inDays": 3 }`. A timed event starts that many minutes after the
 * watch's clock reads when the stores are seeded, and an all-day one that many days after its midnight.
 */
function readCalendar(value: unknown, where: Where): EventSeed[] {
  const field = 'stores.calendar';

  return list(value, WIRE_CAPS.CALENDAR_SLOTS_MAX, where, field).map((event, index) => {
    const at = `${field}[${index}]`;

    if (!isObject(event)) {
      throw new ToolError(`${sets(where, at, event)}. An event takes { "title": "Dentist", "inMinutes": 60, "minutes": 30 }`);
    }

    seedFields(event, ['title', 'location', 'allDay', 'inMinutes', 'minutes', 'inDays'], where, at);

    const allDay = 'allDay' in event ? flag(event.allDay, where, `${at}.allDay`) : false;
    const seed = {
      title: text(event.title, WIRE_CAPS.CALENDAR_TITLE_MAX, where, `${at}.title`),
      location: 'location' in event ? text(event.location, WIRE_CAPS.CALENDAR_LOC_MAX, where, `${at}.location`) : '',
      allDay,
      inMinutes: 0,
      minutes: 0,
      inDays: 0,
    };

    if (allDay) {
      if ('inMinutes' in event || 'minutes' in event) {
        throw new ToolError(`${where.file} sets ${where.owner}${at} as all day with a time. An all-day event takes inDays, the days after today it falls on`);
      }

      return { ...seed, inDays: wholeNumber(event.inDays ?? 0, -30, 30, where, `${at}.inDays`) };
    }

    if ('inDays' in event) {
      throw new ToolError(`${where.file} sets ${where.owner}${at}.inDays on a timed event. A timed event takes inMinutes, the minutes from now it starts, and minutes, how long it runs`);
    }

    return { ...seed, inMinutes: wholeNumber(event.inMinutes, -30 * 1440, 30 * 1440, where, `${at}.inMinutes`), minutes: wholeNumber(event.minutes ?? 60, 0, 30 * 1440, where, `${at}.minutes`) };
  });
}

/**
 * Reads a `stores` block.
 *
 * @param value The block as the file holds it.
 * @param clockMinute The pinned clock as minutes past midnight, which the HRV log has to end by.
 * @param file The file as a message names it.
 * @param owner `gridlock's ` for a face's entry, or empty for the top of the file.
 * @return Each store the block seeds, and null for each it leaves to the fixture.
 */
export function readStores(value: unknown, clockMinute: number, file: string, owner: string): DevStores {
  const where = { file, owner };

  if (!isObject(value)) {
    throw new ToolError(`${sets(where, 'stores', value)}. It takes an object of readings by store, such as { "phone": { "battery": 84 } }`);
  }

  const unknown = Object.keys(value).filter((key) => !(STORE_NAMES as readonly string[]).includes(key));

  if (unknown.length > 0) {
    throw new ToolError(`${file} sets ${owner}stores.${unknown.join(', ')}, which is not a store the dev plugin seeds. It seeds ${STORE_NAMES.join(', ')}`);
  }

  const stores: DevStores = { ...NO_STORES };
  const block = (name: string): Record<string, unknown> => {
    if (!isObject(value[name])) {
      throw new ToolError(`${sets(where, `stores.${name}`, value[name])}. It takes an object of the store's readings`);
    }

    return value[name];
  };

  if ('weather' in value) {
    stores.weather = readWeather(block('weather'), where);
  }

  if ('health' in value) {
    stores.health = readHealth(block('health'), clockMinute, where);
  }

  if ('system' in value) {
    stores.system = readSystem(block('system'), where);
  }

  if ('phone' in value) {
    const phone = block('phone');

    seedFields(phone, ['battery'], where, 'stores.phone');
    stores.phone = { battery: wholeNumber(phone.battery, 0, 100, where, 'stores.phone.battery') };
  }

  if ('music' in value) {
    const music = block('music');

    seedFields(music, ['title', 'artist', 'playing'], where, 'stores.music');
    stores.music = {
      title: 'title' in music ? text(music.title, WIRE_CAPS.MUSIC_TEXT_MAX, where, 'stores.music.title') : '',
      artist: 'artist' in music ? text(music.artist, WIRE_CAPS.MUSIC_TEXT_MAX, where, 'stores.music.artist') : '',
      playing: 'playing' in music ? flag(music.playing, where, 'stores.music.playing') : true,
    };
  }

  if ('stocks' in value) {
    stores.stocks = readStocks(value.stocks, where);
  }

  if ('calendar' in value) {
    stores.calendar = readCalendar(value.calendar, where);
  }

  if ('location' in value) {
    const location = block('location');

    seedFields(location, ['lat', 'lon'], where, 'stores.location');
    stores.location = { lat: text(location.lat, COORD_MAX, where, 'stores.location.lat'), lon: text(location.lon, COORD_MAX, where, 'stores.location.lon') };
  }

  return stores;
}

/** The message key or define each store needs on the face, and what a refusal calls it. */
const STORE_NEEDS: Record<StoreName, { key: string; what: string } | null> = {
  weather: { key: 'WEATHER_TEMPERATURE', what: 'the weather keys' },
  health: null,
  system: null,
  phone: { key: 'PHONE_BATTERY', what: 'the phone battery keys' },
  music: { key: 'MUSIC_TITLE', what: 'the now playing keys' },
  stocks: { key: 'STOCK_STRIP', what: 'STOCK_STRIP' },
  calendar: { key: 'CALENDAR_STRIP', what: 'CALENDAR_STRIP' },
  location: { key: 'LOCATION_LATITUDE', what: 'the coordinate keys' },
};

/**
 * Refuses a seed for a store the face cannot show, since the C would build it into nothing and the
 * screenshot would quietly show the store empty.
 *
 * @param stores The face's stores, from readStores.
 * @param keys The face's message keys, its own and the ones its features bring.
 * @param defines The face's C defines, which HEALTH_HRV is one of.
 * @param face The face, which a refusal names.
 */
export function checkStoresFit(stores: DevStores, keys: string[], defines: Record<string, number>, face: string): void {
  for (const name of STORE_NAMES) {
    const need = STORE_NEEDS[name];

    if (stores[name] !== null && need && !keys.includes(need.key)) {
      throw new ToolError(`paf.dev.config.json seeds ${face}'s ${name} store, but ${face} does not declare ${need.what}, so it has no ${name} store to show`);
    }
  }

  const health = stores.health;

  if (health && (health.hrvLog !== null || health.hrvMs !== null) && !defines.HEALTH_HRV) {
    throw new ToolError(`paf.dev.config.json seeds ${face}'s HRV, but ${face} does not set HEALTH_HRV in its appinfo's defines, so it builds without HRV`);
  }
}
