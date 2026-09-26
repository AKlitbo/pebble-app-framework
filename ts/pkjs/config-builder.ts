/**
 * A generic Clay settings-page builder.
 *
 * buildConfig stamps out the common sections (theme, date, weather, location, and
 * so on) from a small per-section description, so a plain face gets a settings page
 * without hand-assembling one. Each section is its own exported builder taking the
 * same description, so a face whose layout or theme picker needs its own sections in
 * between can lay out its page from the builders it wants. buildConfig stays as the
 * starting point a copied face would reach for first.
 */

import type { ClayConfigItem } from '../clay/types';
import { VIBE_OPTIONS } from './config-rows';

/** The per-section description a face hands buildConfig. Each section is optional.
 * Present means "include it", and its own fields tune it. */
export interface ConfigBuilderOptions {
  heading?: string;
  intro?: string;
  theme?: { label?: string; description?: string; options?: Array<{ label: string; value: string | number }> };
  /** Extra controls to sit inside the Appearance section, under the theme picker. For a setting
   * that belongs with the look of the face rather than in a section of its own. */
  appearanceItems?: ClayConfigItem[];
  /** Extra controls to sit inside the Clock section, under the time format. For a setting that
   * qualifies how the time itself is written. */
  clockItems?: ClayConfigItem[];
  bluetooth?: { description?: string };
  quietTime?: { description?: string };
  hourlyVibe?: { label?: string; description?: string };
  /** beats adds the .beat date formats to the end of the list. Only a face whose date line runs
   * through readout_date asks for them, since that is what fills the token in. */
  date?: { label?: string; description?: string; default?: string; beats?: boolean; options?: Array<{ label: string; value: string | number }> };
  /** capabilities is Clay's own item filter. A face that shows no step count on some watch
   * passes e.g. ['NOT_PLATFORM_GABBRO'] and Clay drops the control on that platform for it,
   * rather than every face losing it. */
  steps?: { label?: string; description?: string; capabilities?: string[] };
  /** timeZone adds the alternate time zone picker to the Clock section, for a face with a second
   * clock. It needs the CLOCK_TIMEZONE_1 key, and works with or without weather. */
  clock?: { timeZone?: boolean };
  location?: { gpsDefault?: boolean };
  weather?: unknown;
  temperature?: unknown;
  battery?: { label?: string; description?: string };
  layoutSections?: ClayConfigItem[];
}

/** The stock date-format choices, shared by faces that don't override them. */
const defaultDateOptions = [
  { 'label': '2026.0618 (yyyy.mmdd)', 'value': '%Y.%m%d' },
  { 'label': '2026.06.18 (yyyy.mm.dd)', 'value': '%Y.%m.%d' },
  { 'label': '06.18.2026 (mm.dd.yyyy)', 'value': '%m.%d.%Y' },
  { 'label': '18.06.2026 (dd.mm.yyyy)', 'value': '%d.%m.%Y' },
  { 'label': '2026-06-18 (yyyy-mm-dd)', 'value': '%Y-%m-%d' },
  { 'label': '06-18-2026 (mm-dd-yyyy)', 'value': '%m-%d-%Y' },
  { 'label': '18-06-2026 (dd-mm-yyyy)', 'value': '%d-%m-%Y' },
  { 'label': '2026/06/18 (yyyy/mm/dd)', 'value': '%Y/%m/%d' },
  { 'label': '06/18/2026 (mm/dd/yyyy)', 'value': '%m/%d/%Y' },
  { 'label': '18/06/2026 (dd/mm/yyyy)', 'value': '%d/%m/%Y' },
  { 'label': 'JUN 18 (mmm dd)', 'value': '%b %d' },
  { 'label': 'JUN 18 2026 (mmm dd yyyy)', 'value': '%b %d %Y' },
  { 'label': '18 JUN 2026 (dd mmm yyyy)', 'value': '%d %b %Y' },
  { 'label': 'THU JUN 18 (ddd mmm dd)', 'value': '%a %b %d' },
  { 'label': 'THU 18 JUN (ddd dd mmm)', 'value': '%a %d %b' },
  { 'label': '2026.169 (yyyy.dayofyear)', 'value': '%Y.%j' },
  { 'label': '2026-169 (yyyy-dayofyear)', 'value': '%Y-%j' },
];

/** The .beat date-format choices, tacked onto the list above by a face that opts in.
 * {B} is not a strftime token. It is the marker readout_date swaps for a .beats reading,
 * so a date line can end in one while the clock stays on normal time. Only a face whose
 * date line runs through readout_date can offer these, since nothing else fills them in. */
const beatsDateOptions = [
  { 'label': '0618.672 (mmdd.beat)', 'value': '%m%d.{B}' },
  { 'label': '2026.0618.672 (yyyy.mmdd.beat)', 'value': '%Y.%m%d.{B}' },
];

/**
 * The Appearance section: the theme picker when the face has one, its own appearance controls, and
 * the Quiet Time icon toggle when asked for.
 *
 * @param options The per-section description, read for theme, appearanceItems, and quietTime.
 * @return The section.
 */
export function appearanceSection(options: ConfigBuilderOptions): ClayConfigItem {
  const theme = options.theme || {};

  return {
    'type': 'section',
    'items': [
      {
        'type': 'heading',
        'defaultValue': 'Appearance',
      },
      // a face that colours itself from individual pickers rather than a preset list omits
      // theme entirely, and the section is then just its own appearanceItems
      ...(options.theme ? [{
        'type': 'select',
        'messageKey': 'APPEARANCE_THEME',
        'label': theme.label || 'Frame Theme',
        'description': theme.description || 'Colour scheme for the watch frame.',
        'defaultValue': 0,
        'options': theme.options,
      }] : []),
      // a face's own appearance controls sit with the theme picker rather than in a section
      // of their own, because a section per setting reads as a longer page than it is
      ...(options.appearanceItems || []),
      ...(options.quietTime ? [{
        'type': 'toggle',
        'messageKey': 'APPEARANCE_QUIET_TIME_ICON',
        'label': 'Show Quiet Time Icon',
        'description': options.quietTime.description || 'Show a muted-speaker glyph next to bluetooth while Quiet Time is on.',
        'defaultValue': false,
      }] : []),
    ],
  };
}

/**
 * The Bluetooth section: the connection icon and the buzz on connect and disconnect.
 *
 * @param options The per-section description, read for bluetooth.
 * @return The section.
 */
export function bluetoothSection(options: ConfigBuilderOptions): ClayConfigItem {
  const bluetooth = options.bluetooth || {};

  return {
    'type': 'section',
    'items': [
      {
        'type': 'heading',
        'defaultValue': 'Bluetooth',
      },
      {
        'type': 'toggle',
        'messageKey': 'CONNECTION_BLUETOOTH_ICON',
        'label': 'Show Connection Icon',
        'description': bluetooth.description || 'Display a bluetooth glyph showing whether the watch is connected to your phone.',
        'defaultValue': true,
      },
      {
        'type': 'select',
        'messageKey': 'CONNECTION_VIBE_CONNECT',
        'label': 'Vibrate on Connect',
        'description': 'Buzz the watch when the phone reconnects.',
        'defaultValue': 0,
        'options': VIBE_OPTIONS,
      },
      {
        'type': 'select',
        'messageKey': 'CONNECTION_VIBE_DISCONNECT',
        'label': 'Vibrate on Disconnect',
        'description': 'Buzz the watch when the phone disconnects.',
        'defaultValue': 0,
        'options': VIBE_OPTIONS,
      },
    ],
  };
}

/**
 * The Clock section: the date and time formats, the face's own clock controls, and the alternate
 * time zone picker and hourly buzz when asked for.
 *
 * @param options The per-section description, read for date, clockItems, clock, and hourlyVibe.
 * @return The section.
 */
export function clockSection(options: ConfigBuilderOptions): ClayConfigItem {
  const date = options.date || {};

  const dateDescription = date.beats
    ? 'How the date line is written. The .beat formats add Swatch Internet Time, so you can read both at once.'
    : 'How the date line is written.';

  const clockItems: ClayConfigItem[] = [
    {
      'type': 'heading',
      'defaultValue': 'Clock',
    },
    {
      'type': 'select',
      'messageKey': 'CLOCK_DATE_FORMAT',
      'label': date.label || 'Date Format',
      'description': date.description || dateDescription,
      'defaultValue': date.default || '%Y.%m%d',
      'options': [...(date.options || defaultDateOptions), ...(date.beats ? beatsDateOptions : [])],
    },
    {
      'type': 'select',
      'messageKey': 'CLOCK_TIME_FORMAT',
      'label': 'Time Format',
      'description': 'How the main time is shown. .beats is Swatch Internet Time (Biel Mean Time).',
      'defaultValue': 0,
      'options': [
        { label: 'System Default', value: 0 },
        { label: '12-hour (08:30)', value: 1 },
        { label: '12-hour (8:30)', value: 4 },
        { label: '24-hour (20:30)', value: 2 },
        { 'label': '.beats (Swatch Internet Time)', 'value': 3 },
      ],
    },
    // a face's own clock controls follow the time format, since that is what they usually qualify
    ...(options.clockItems || []),
  ];

  // the search writes the place or zone it saved, and the pkjs side turns that into the minutes
  // from UTC and the name a second clock needs. only faces with a readout for it ask for the
  // control
  if (options.clock && options.clock.timeZone) {
    clockItems.push({
      'type': 'locationsearch',
      'messageKey': 'CLOCK_TIMEZONE_1',
      'timeZone': true,
      'label': 'Alternate Time Zone',
      'description': 'Sets the time shown by the alternate time zone readout. Search a city, a zone name such as Europe/London, or type UTC or an offset like UTC+05:30.',
      'attributes': {
        'placeholder': 'e.g. Phoenix, UTC, or Europe/London',
      },
    });
  }

  if (options.hourlyVibe) {
    clockItems.push({
      'type': 'select',
      'messageKey': 'CLOCK_HOURLY_VIBE',
      'label': options.hourlyVibe.label || 'Hourly Vibration',
      'description': options.hourlyVibe.description || 'Buzz at the top of every hour. Silenced automatically during Quiet Time.',
      'defaultValue': 0,
      'options': VIBE_OPTIONS,
    });
  }

  return {
    'type': 'section',
    'items': clockItems,
  };
}

/**
 * The Health section: what the stats slot shows, and the battery readout when asked for. It is on
 * every page, since the stats slot is.
 *
 * @param options The per-section description, read for steps and battery.
 * @return The section.
 */
export function healthSection(options: ConfigBuilderOptions): ClayConfigItem {
  const steps = options.steps || {};

  // when the steps control is the only thing in this section and it is filtered out, the heading
  // goes with it. a lone section title with nothing under it reads as a control that failed to
  // load rather than one that does not apply
  const healthHeadingCapabilities = steps.capabilities && !options.battery ? steps.capabilities : undefined;

  const healthItems: ClayConfigItem[] = [
    {
      'type': 'heading',
      'defaultValue': 'Health',
      ...(healthHeadingCapabilities ? { 'capabilities': healthHeadingCapabilities } : {}),
    },
    {
      'type': 'select',
      'messageKey': 'HEALTH_STEPS_MODE',
      'label': steps.label || 'Stats Readout',
      'description': steps.description || 'What the stats slot shows: step count, or distance walked.',
      'defaultValue': 0,
      'options': [
        { 'label': 'Steps', 'value': 0 },
        { 'label': 'Distance (Miles)', 'value': 1 },
        { 'label': 'Distance (Kilometers)', 'value': 2 },
      ],
      ...(steps.capabilities ? { 'capabilities': steps.capabilities } : {}),
    },
  ];

  if (options.battery) {
    healthItems.push({
      'type': 'select',
      'messageKey': 'BATTERY_DISPLAY',
      'label': options.battery.label || 'Battery',
      'description': options.battery.description || 'What the battery readout shows.',
      'defaultValue': 0,
      'options': [
        { 'label': 'Icon + Percent', 'value': 0 },
        { 'label': 'Icon Only', 'value': 1 },
        { 'label': 'Percent Only', 'value': 2 },
      ],
    });
  }

  return {
    'type': 'section',
    'items': healthItems,
  };
}

/**
 * The Location Settings section: the GPS toggles and the manual city the weather fetch reads.
 *
 * @param options The per-section description, read for location.
 * @return The section, or null for a face that asks for no location.
 */
export function locationSection(options: ConfigBuilderOptions): ClayConfigItem | null {
  // the type leaves timeZone out of location, but an options object built in a variable gets past
  // that check, and the picker would then vanish from the page without a word
  if (options.location && (options.location as { timeZone?: unknown }).timeZone) {
    console.warn('buildConfig: location.timeZone is gone. Pass clock: { timeZone: true } for the time zone picker');
  }

  if (!options.location) {
    return null;
  }

  const locationItems: ClayConfigItem[] = [
    {
      'type': 'heading',
      'defaultValue': 'Location Settings',
    },
    {
      'type': 'toggle',
      'messageKey': 'LOCATION_USE_GPS',
      'label': 'Enable Phone GPS',
      'description': 'Automatically fetch weather for your current location.',
      'defaultValue': options.location.gpsDefault !== undefined ? options.location.gpsDefault : false,
    },
    {
      'type': 'toggle',
      'messageKey': 'LOCATION_GPS_FALLBACK',
      'label': 'Fallback to Manual Location',
      'description': 'If GPS is disabled or unavailable, use the city typed below.',
      'defaultValue': true,
    },
    {
      'type': 'locationsearch',
      'messageKey': 'LOCATION_NAME',
      'label': 'Manual Location',
      'attributes': {
        'placeholder': 'Search a city, e.g. Phoenix',
      },
    },
  ];

  return {
    'type': 'section',
    'items': locationItems,
  };
}

/**
 * The Weather section: the temperature unit and the provider picker, each when asked for.
 *
 * @param options The per-section description, read for temperature and weather.
 * @return The section, or null for a face that asks for neither.
 */
export function weatherSection(options: ConfigBuilderOptions): ClayConfigItem | null {
  if (!(options.weather || options.temperature)) {
    return null;
  }

  const weatherItems: ClayConfigItem[] = [
    {
      'type': 'heading',
      'defaultValue': 'Weather',
    },
  ];

  if (options.temperature) {
    weatherItems.push({
      'type': 'select',
      'messageKey': 'WEATHER_TEMPERATURE_UNIT',
      'label': 'Temperature Unit',
      'defaultValue': 0,
      'options': [
        { 'label': 'Celsius (°C)', 'value': 0 },
        { 'label': 'Fahrenheit (°F)', 'value': 1 },
      ],
    });
  }

  if (options.weather) {
    weatherItems.push(
      {
        'type': 'text',
        'defaultValue': 'Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.',
      },
      {
        'type': 'select',
        'messageKey': 'WEATHER_PROVIDER',
        'label': 'Data Source',
        'defaultValue': 'openmeteo',
        'options': [
          { 'label': 'Open-Meteo (Free, No Key Required)', 'value': 'openmeteo' },
          { 'label': 'OpenWeatherMap', 'value': 'owm' },
          { 'label': 'WeatherAPI.com', 'value': 'weatherapi' },
        ],
      },
      {
        'type': 'input',
        'messageKey': 'WEATHER_API_KEY',
        'label': 'API Key',
        'description': 'Only required if you selected OpenWeatherMap or WeatherAPI above.',
        'attributes': {
          'placeholder': 'Paste your private API key here...',
          'limit': 64,
        },
      }
    );
  }

  return {
    'type': 'section',
    'items': weatherItems,
  };
}

/**
 * Builds a Clay config array from a per-section description.
 *
 * It is the section builders above in their usual order, for a face that wants the whole page. A
 * face that needs its own sections in between calls the builders it wants and lays them out itself.
 *
 * Top-level fields:
 *   heading, intro        page title and lead paragraph (both optional)
 *
 * Section objects (each section is customized through its own fields):
 *   appearanceItems [ClayConfigItem]            extra controls inside the Appearance section
 *   clockItems      [ClayConfigItem]            extra controls inside the Clock section
 *   bluetooth { description? }                   always shown
 *   date     { label?, description?, default?, beats?, options? }
 *   steps    { label?, description?, capabilities? }
 *
 * Optional sections (present = included, omitted = excluded):
 *   theme       { label?, description?, options? }  the theme picker. options is the theme list,
 *                                                   and a picker given none has nothing to offer
 *   clock       { timeZone? }                    adds the alternate time zone picker to the Clock section
 *   location    { gpsDefault? }                  the GPS toggles and the manual city, which weather reads
 *   weather     {}                               marker, adds the provider picker to the Weather section
 *   temperature {}                               marker, adds the unit dropdown to the Weather section
 *
 * @param options The per-section description to build the page from.
 * @return The assembled Clay config array, ready to hand to Clay.
 */
function buildConfig(options: ConfigBuilderOptions): ClayConfigItem[] {
  const config: ClayConfigItem[] = [
    {
      'type': 'heading',
      'defaultValue': options.heading || 'Watchface Configuration',
    },
    {
      'type': 'text',
      'defaultValue': options.intro || 'Personalize your layout and make this watchface your own.',
    },
    appearanceSection(options),
    // face-specific sections (e.g. a layout and goals) sit right after Appearance
    ...(options.layoutSections || []),
    bluetoothSection(options),
    clockSection(options),
    healthSection(options),
  ];

  [locationSection(options), weatherSection(options)].forEach((section) => {
    if (section) {
      config.push(section);
    }
  });

  config.push({
    'type': 'submit',
    'defaultValue': 'Save & Apply to Watch',
  });

  return config;
}

// attach the date options to the function too so it matches the module.exports shape
// so a consumer can read them off the default export as well as the named one
buildConfig.defaultDateOptions = defaultDateOptions;
buildConfig.beatsDateOptions = beatsDateOptions;

export { defaultDateOptions, beatsDateOptions };

export default buildConfig;
