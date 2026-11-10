/**
 * Specs for the settings page loader and the choice counts the build reads from it.
 *
 * paf build loads the face's page from its compiled phone code and writes a SETTINGS_COUNT_<KEY> for
 * every choice it offers, which the watch clamps each saved and incoming choice to. A count one too
 * low turns the wearer's last theme away and loads the default. A count for a text select would let
 * the watch clamp a string. A page loaded some other way than the phone builds it, on one watch only,
 * or on a phone an earlier face left state on, would count the wrong page. A header from another build
 * of the sandbox would hand the C counts from a page the face no longer ships. Those are worth pinning,
 * and so is the empty header a face with no settings page gets, since its C still includes it.
 *
 * The header also carries each default the page opens with, which the watch starts a fresh install
 * on. A default written in the wrong C type would not build, and one escaped wrong would end the
 * string early. The checks that stop the build on a page the watch or the phone would get wrong are
 * pinned one refusal at a time, each beside the page it lets through.
 *
 * The start read decides which keys the build adds, so a feature it misses ships a face without the
 * keys the feature needs. It is pinned on hand-written sandboxes that stand in a tiny app module and a
 * face's index.js, for the reads a real face cannot easily show: a feature on one watch alone, a
 * second call, a feature passed only beside another's key, a face that throws as it loads, and one that
 * starts an interval, which would keep the build running after it is done.
 *
 * The loading specs build three of the dev plugin's fixture faces with tsc into sandboxes under build/
 * beside this file, the way the build does, and load each one's page from the compiled code. The
 * sandboxes sit inside the repo so the compiled code finds Clay in its node_modules. The header checks
 * run the waf build's own Python helper, and skip on a machine without Python.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { cleanEmit, compile, facePaths, fillEmit, writeTsconfig, type FacePaths, type FacePlace } from './build-pkjs.ts';
import { ENGINE } from '../shared/paths.ts';
import { pluginSourceDefaults } from '../manifest/providers.ts';
import { tempDir } from '../../ts/testing/temp-dir.ts';
import { stubModuleLoad } from '../../ts/testing/module-load.ts';
import {
  captureStart,
  forgetCompiled,
  checkCustomClay,
  checkPage,
  choiceCounts,
  installHost,
  largestCounts,
  loadOnPlatforms,
  loadSettingsPage,
  messageKeysFrom,
  messageKeysOf,
  pageDefaults,
  pageFacts,
  platformsOf,
  sandboxFingerprint,
  PEBBLE_PLATFORMS,
  settingsPageHeader,
  startFacts,
  KNOWN_FIELDS,
  type AppinfoFacts,
  type CheckedPage,
  type KnownField,
  type StartHost,
  type StartOptions,
} from './settings-page.ts';

/**
 * Loads a page the way clay-preview does, with the keys stood in as message_keys on a fresh emery phone,
 * and puts both back after.
 */
function loadAsPreview(paths: FacePaths, keys: Record<string, number>, options: Parameters<typeof loadSettingsPage>[3]): ReturnType<typeof loadSettingsPage> {
  const restoreLoad = stubModuleLoad((id) => (id === 'message_keys' ? keys : undefined));
  const restoreHost = installHost({ platform: 'emery', settings: null }, null);

  try {
    forgetCompiled(paths);
    return loadSettingsPage(paths, keys, true, options);
  } finally {
    restoreHost();
    restoreLoad();
  }
}

/** The dev plugin's fixture faces, which page-check builds too. */
const FIXTURES = path.join(ENGINE, 'plugins', 'dev', 'fixtures');

/** Where the fixture builds go. */
const OUT_DIR = path.join(import.meta.dirname, 'build', 'settings-page');

/** The waf build's helpers, whose header check the Python specs run. */
const WAF_DIR = path.join(ENGINE, 'waf');

/** A fingerprint for a header whose sandbox does not matter to the spec. */
const ANY_FINGERPRINT = 'f'.repeat(64);

/** A select on a key with the given option values. */
function select(key: string, values: Array<string | number>, capabilities?: string[]): Record<string, unknown> {
  return { type: 'select', messageKey: key, options: values.map((value) => ({ label: String(value), value })), ...(capabilities ? { capabilities } : {}) };
}

/** The Python that runs on this machine, or null when there is none. */
function findPython(): string | null {
  return ['python3', 'python'].find((name) => spawnSync(name, ['--version']).status === 0) ?? null;
}

describe('choiceCounts', () => {
  /** A face could list its themes in any order on the page, and the count has to come out the same whatever the order. */
  test('counts values out of order to the highest plus one', () => {
    const page = [select('APPEARANCE_THEME', [0, 3, 4, 7, 8, 1, 5, 2, 6])];

    const result = choiceCounts(page);

    expect(result).toEqual({ APPEARANCE_THEME: 9 });
  });

  /** A theme retired from the middle would otherwise give a count that turns the last theme away and loads the default. */
  test('counts past a gap to the highest plus one', () => {
    const page = [select('APPEARANCE_THEME', [0, 1, 3])];

    const result = choiceCounts(page);

    expect(result).toEqual({ APPEARANCE_THEME: 4 });
  });

  /** Options written as "3" are still a list of choices, since Clay sends a select's value as text anyway. */
  test('counts digit text the same as a number', () => {
    const page = [select('CLOCK_WEEK_START', ['0', '1'])];

    const result = choiceCounts(page);

    expect(result).toEqual({ CLOCK_WEEK_START: 2 });
  });

  /** The date format and the providers are not choices, and a count for them would let a face clamp a string. */
  test('gives no count to a select with any text value', () => {
    const page = [select('CLOCK_DATE_FORMAT', ['%a %d %b', '%Y.%m%d']), select('WEATHER_PROVIDER', ['openmeteo', 3])];

    const result = choiceCounts(page);

    expect(result).toEqual({});
  });

  /** The watch keeps a count in a byte, and 255 would wrap to 0 and clamp every value to the default. */
  test('gives no count to a select with a value past 254', () => {
    const page = [select('STOCK_POLL', [5, 15, 255]), select('CALENDAR_POLL', [-1, 0])];

    const result = choiceCounts(page);

    expect(result).toEqual({});
  });

  /** The face's own choices sit inside sections, and a theme picker or radio group is as much a choice as a select. */
  test('counts a select two sections deep, a radio group, and a theme picker', () => {
    const page = [
      { type: 'section', items: [{ type: 'section', items: [select('HEALTH_STEPS_MODE', [0, 1, 2])] }] },
      { type: 'radiogroup', messageKey: 'APPEARANCE_THEME_MODE', options: [{ label: 'Day', value: 0 }, { label: 'Night', value: 1 }] },
      { type: 'themePreview', messageKey: 'APPEARANCE_THEME', options: [{ label: 'Classic', value: 0 }, { label: 'Dusk', value: 1 }, { label: 'Ink', value: 2 }] },
    ];

    const result = choiceCounts(page);

    expect(result).toEqual({ HEALTH_STEPS_MODE: 3, APPEARANCE_THEME_MODE: 2, APPEARANCE_THEME: 3 });
  });

  /** Clay groups a select's options by handing a group a list as its value, and the choices inside still count. */
  test('counts the options inside an option group', () => {
    const page = [{ type: 'select', messageKey: 'APPEARANCE_THEME', options: [{ label: 'Light', value: [{ label: 'Paper', value: 0 }] }, { label: 'Dark', value: [{ label: 'Ink', value: 4 }] }] }];

    const result = choiceCounts(page);

    expect(result).toEqual({ APPEARANCE_THEME: 5 });
  });

  /** A toggle or an input on a key is not a list of choices, so it never gives the key a count. */
  test('skips a control that is not a choice', () => {
    const page = [{ type: 'toggle', messageKey: 'LOCATION_USE_GPS', defaultValue: true }, { type: 'input', messageKey: 'WEATHER_API_KEY' }];

    const result = choiceCounts(page);

    expect(result).toEqual({});
  });

  /**
   * A face can offer a rectangular watch one list and a round one a longer list on the same key, kept
   * apart by Clay's capabilities. One pbw holds both, so the count has to take the round watch's
   * themes, or a wearer on gabbro would have their last theme turned away.
   */
  test('counts two controls on one key, split by watch shape, as the larger', () => {
    const page = [select('APPEARANCE_THEME', [0, 1, 2], ['NOT_PLATFORM_GABBRO']), select('APPEARANCE_THEME', [0, 1, 2, 3, 4], ['PLATFORM_GABBRO'])];

    const result = choiceCounts(page);

    expect(result).toEqual({ APPEARANCE_THEME: 5 });
  });

  /** A text control beside a numeric one on a key means the key carries text, which the watch cannot hold to a count. */
  test('gives no count to a key where any control has a text value', () => {
    const page = [select('APPEARANCE_THEME', [0, 1, 2]), select('APPEARANCE_THEME', ['dark', 'light'])];

    const result = choiceCounts(page);

    expect(result).toEqual({});
  });

  /** A slot of an indexed key rides on the key's own MESSAGE_KEY on the watch, so it counts under the key's name. */
  test('counts a key with an index under its name', () => {
    const page = [select('SLOT_MODE[0]', [0, 1]), select('SLOT_MODE[1]', [0, 1, 2])];

    const result = choiceCounts(page);

    expect(result).toEqual({ SLOT_MODE: 3 });
  });
});

/** A page as the checks see it, on emery, opened as the face handed it over. */
function pageOf(config: unknown[], extra: Partial<CheckedPage> = {}): CheckedPage {
  return { platform: 'emery', given: { clayConfig: config }, clay: { config }, features: [], start: { hooks: [] }, ...extra };
}

/** An appinfo declaring the given keys, with no text defines unless some are given. */
function appinfoOf(messageKeys: string[], textDefines: Record<string, string> = {}): AppinfoFacts {
  return { messageKeys, textDefines };
}

/** Runs the checks on some pages the way the build does, with the facts read from those pages once. */
function check(pages: CheckedPage[], appinfo: AppinfoFacts): void {
  checkPage('my-face', pages, pageFacts(pages), appinfo);
}

describe('pageDefaults', () => {
  /**
   * The watch's fields take a number or a string. Clay saves a select as text, so a choice of "3" has
   * to reach a choice field as 3, and a toggle's true as 1.
   */
  test('writes each default in the C the watch field takes', () => {
    const page = [
      { type: 'toggle', messageKey: 'CONNECTION_BLUETOOTH_ICON', defaultValue: false },
      { ...select('APPEARANCE_THEME', ['0', '1', '2', '3']), defaultValue: '3' },
      { ...select('CLOCK_DATE_FORMAT', ['%b %d', '%Y.%m%d']), defaultValue: '%b %d' },
      { type: 'color', messageKey: 'APPEARANCE_ACCENT', defaultValue: '0xFF0000' },
      { type: 'color', messageKey: 'APPEARANCE_INK', defaultValue: 255 },
      { type: 'input', messageKey: 'WEATHER_API_KEY', defaultValue: '1234' },
    ];

    const result = pageDefaults([page]);

    expect(result).toEqual({
      CONNECTION_BLUETOOTH_ICON: '0',
      APPEARANCE_THEME: '3',
      CLOCK_DATE_FORMAT: '"%b %d"',
      APPEARANCE_ACCENT: '16711680',
      APPEARANCE_INK: '255',
      WEATHER_API_KEY: '"1234"',
    });
  });

  /**
   * A quote or a backslash in a format would end the C string early, two question marks start a
   * trigraph, and a letter outside ASCII has to reach the watch as the same UTF-8 bytes.
   */
  test('escapes text so the C string holds exactly the page\'s bytes', () => {
    const page = [{ type: 'input', messageKey: 'CLOCK_LABEL', defaultValue: 'a"b\\c??d é' }];

    const result = pageDefaults([page]).CLOCK_LABEL;

    expect(result).toBe('"a\\"b\\\\c\\?\\?d \\303\\251"');
  });

  /** A slider's saved value is scaled by its step, a list has no single value, and each slot of an indexed key has its own default. */
  test('leaves out a slider, a list, and a key with an index', () => {
    const page = [
      { type: 'slider', messageKey: 'LIGHT_LEVEL', defaultValue: 5 },
      { type: 'checkboxgroup', messageKey: 'DAYS', defaultValue: [true, false] },
      { ...select('SLOT_MODE[1]', [0, 1]), defaultValue: 1 },
    ];

    const result = pageDefaults([page]);

    expect(result).toEqual({});
  });

  /**
   * Clay sets a control with no default to empty text. A toggle opens off, a text input empty, and a
   * colour black, so a fresh watch has to start on those. A select or radio group with no option for
   * empty text opens with nothing picked and saves empty text the watch leaves alone, so it gives no
   * default, while one with such an option opens on it.
   */
  test('takes what Clay opens a control on when it declares no default', () => {
    const page = [
      { type: 'toggle', messageKey: 'APPEARANCE_QUIET_TIME_ICON' },
      { type: 'input', messageKey: 'WEATHER_API_KEY' },
      { type: 'color', messageKey: 'APPEARANCE_ACCENT' },
      select('HEALTH_STEPS_MODE', [0, 1, 2]),
      { type: 'radiogroup', messageKey: 'CLOCK_WEEK_START', options: [{ label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }] },
      select('HEALTH_GOAL_VIBE', ['', 'S', 'L']),
    ];

    const result = pageDefaults([page]);

    expect(result).toEqual({ APPEARANCE_QUIET_TIME_ICON: '0', WEATHER_API_KEY: '""', APPEARANCE_ACCENT: '0', HEALTH_GOAL_VIBE: '""' });
  });

  /**
   * A shared entry keeps a number, so a default the page writes as digit text, such as a hidden store's
   * "2", has to reach it as 2, or the C would take a string where it wants a number.
   */
  test('writes a shared entry\'s default in its field\'s type whatever control gives it', () => {
    const page = [{ type: 'hiddenStore', messageKey: 'APPEARANCE_THEME', defaultValue: '2' }, { type: 'hiddenStore', messageKey: 'LAYOUT_NIGHT', defaultValue: '0' }];

    const result = pageDefaults([page]);

    expect(result).toEqual({ APPEARANCE_THEME: '2', LAYOUT_NIGHT: '"0"' });
  });
});

describe('KNOWN_FIELDS', () => {
  /** The headers the catalog's own counts come from. */
  const COUNT_HEADERS = [path.join('c', 'pebble', 'system', 'settings', 'setting_values.h'), path.join('c', 'core', 'units', 'wind.h')];

  /**
   * The value C gives an enum's count marker, such as VIBE_COUNT, read from the headers. Each name
   * before it takes the number it is set to, or one past the name before it, as C counts them.
   */
  function enumCount(name: string): number {
    const source = COUNT_HEADERS.map((header) => fs.readFileSync(path.join(ENGINE, header), 'utf8')).join('\n');
    const bodies = [...source.matchAll(/typedef enum\s*\{([^}]*)\}/g)].map((match) => match[1].replace(/\/\/.*$/gm, ''));
    const entries = (bodies.find((body) => new RegExp(`\\b${name}\\b`).test(body)) ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
    let next = 0;

    for (const entry of entries) {
      const [enumerator, value] = entry.split('=').map((part) => part.trim());
      const current = value === undefined ? next : Number(value);

      if (enumerator === name) {
        return current;
      }

      next = current + 1;
    }

    throw new Error(`no enum in the headers holds ${name}`);
  }

  /** Each KNOWN_* macro's message key, the field its default goes in, a text field's size, and a count the framework sets, read from the catalog. */
  function catalogFields(): Record<string, KnownField> {
    const catalog = fs.readFileSync(path.join(ENGINE, 'c', 'pebble', 'system', 'settings', 'settings_catalog.h'), 'utf8');
    const macros = catalog.split(/^#define KNOWN_/m).slice(1).map((macro) => macro.split(/\n(?!\s)/)[0]);

    return Object.fromEntries(macros.map((macro) => {
      const key = /&MESSAGE_KEY_(\w+)/.exec(macro)?.[1] as string;
      const field = /\.(default_num|default_str) = SETTINGS_DEFAULT\((\w+)\)/.exec(macro);
      const size = /\.size = (\d+)/.exec(macro);
      // a count from the page goes through SETTINGS_COUNT_CHECKED, and the page check holds the default to that one
      const count = /\.enum_count = (\d+|[A-Z_]+_COUNT)\b/.exec(macro)?.[1];

      expect(field?.[2]).toBe(key);

      if (field?.[1] === 'default_str') {
        return [key, { field: 'default_str', size: Number(size?.[1]) }];
      }

      return [key, count === undefined ? { field: 'default_num' } : { field: 'default_num', count: /^\d+$/.test(count) ? Number(count) : enumCount(count) }];
    }));
  }

  /**
   * The build holds each shared entry's default to its field from this table. A KNOWN_* entry added to
   * the catalog, a buffer resized, or a choice added to one of the framework's own lists without the
   * table would let a default through that the C refuses or the watch cannot hold.
   */
  test('matches every KNOWN_* entry in settings_catalog.h', () => {
    const result = catalogFields();

    expect(result).toEqual(KNOWN_FIELDS);
  });
});

describe('checkCustomClay', () => {
  /** Clay runs the custom function inside the page, and a value that is not one stops the page from building on the phone. */
  test('refuses a customClay that is not a function', () => {
    const call = () => checkCustomClay('my-face', 'reset');

    expect(call).toThrow("my-face's customClay is a string, not a function. Clay runs it inside the settings page, so pass a function, or leave customClay out");
  });

  /** An arrow sees the this around it rather than the page, so the face's code runs but cannot reach a single row. */
  test('refuses a customClay written as an arrow', () => {
    const call = () => checkCustomClay('my-face', () => {});

    expect(call).toThrow("my-face's customClay is not written with the function keyword. Clay hands it the settings page as this, which an arrow or a method cannot take, so write it as function customClay() { ... }");
  });

  /** A plain function is what the phone expects, and the phone reads anything falsy as no customClay at all. */
  test.each([
    ['a plain function', function customClay() {}],
    ['an async function', async function customClay() {}],
    ['undefined', undefined],
    ['null', null],
    ['false', false],
    ['empty text', ''],
    ['0', 0],
  ])('takes %s', (_name, customClay) => {
    const call = () => checkCustomClay('my-face', customClay);

    expect(call).not.toThrow();
  });
});

describe('checkPage', () => {
  /** Clay sends a row on an undeclared key under undefined0, which breaks every settings save. */
  test('refuses a control on a key the appinfo does not declare', () => {
    const page = pageOf([{ type: 'section', items: [{ ...select('APPEARANCE_THEME', [0, 1]), defaultValue: 0 }] }]);

    const call = () => check([page], appinfoOf(['CLOCK_DATE_FORMAT']));

    expect(call).toThrow("my-face's settings page has a control on APPEARANCE_THEME, which its appinfo does not declare. Clay would send it under the key undefined0, which breaks every settings save. Add APPEARANCE_THEME to messageKeys and build with --clean, or take the control off the page");
  });

  /** A slot of an indexed key rides on the key's own id plus its index, so the key declared with its size covers it. */
  test('takes a slot of a key declared with its size', () => {
    const page = pageOf([{ ...select('SLOT_MODE[2]', [0, 1]), defaultValue: 0 }]);

    const call = () => check([page], appinfoOf(['SLOT_MODE[4]']));

    expect(call).not.toThrow();
  });

  /** A request nothing on the phone answers leaves the watch asking forever, with only a log line on the phone to say why. */
  test('refuses a request key no feature answers, naming the feature to pass', () => {
    const page = pageOf([], { features: [{ requests: ['WEATHER_REQUEST'] }] });

    const call = () => check([page], appinfoOf(['SETTINGS_REQUEST', 'WEATHER_REQUEST', 'STOCK_REQUEST']));

    expect(call).toThrow('my-face declares STOCK_REQUEST, but no feature it passes startPebbleApp answers it, so the watch would ask for it and wait forever. Pass stocks from ts/stock/feature in features, or take STOCK_REQUEST out of messageKeys');
  });

  /** No framework feature answers a face's own request, so the refusal has to say how the face answers it itself. */
  test('refuses a face\'s own request key, saying how a feature of the face\'s own answers it', () => {
    const page = pageOf([]);

    const call = () => check([page], appinfoOf(['SETTINGS_REQUEST', 'TIDE_REQUEST']));

    expect(call).toThrow("my-face declares TIDE_REQUEST, but no feature it passes startPebbleApp answers it, so the watch would ask for it and wait forever. Pass the feature that answers TIDE_REQUEST in features, or take TIDE_REQUEST out of messageKeys. A small feature of the face's own answers it by returning requests: ['TIDE_REQUEST']");
  });

  /** The providers' own hooks answer a request the same as a feature does on the phone, and the app answers SETTINGS_REQUEST itself. */
  test('takes a request a provider hook answers', () => {
    const page = pageOf([], { start: { hooks: [{ requests: ['CALENDAR_REQUEST'] }] } });

    const call = () => check([page], appinfoOf(['SETTINGS_REQUEST', 'CALENDAR_REQUEST']));

    expect(call).not.toThrow();
  });

  /** A default the select does not list opens on a choice the wearer cannot pick, and the watch starts there too. */
  test('refuses a choice whose default is not one of its options', () => {
    const page = pageOf([{ ...select('HEALTH_STEPS_MODE', [0, 1, 2]), defaultValue: 5 }]);

    const call = () => check([page], appinfoOf(['HEALTH_STEPS_MODE']));

    expect(call).toThrow("my-face's settings page defaults HEALTH_STEPS_MODE to 5, which is not one of its options. The page cannot show a default it does not list, and the watch would start on a choice the wearer cannot pick, so make the default one of the options");
  });

  /** Clay saves a select as text, so a default of "2" among number options is the same choice. */
  test('takes a default written as digit text among number options', () => {
    const page = pageOf([{ ...select('HEALTH_STEPS_MODE', [0, 1, 2]), defaultValue: '2' }]);

    const call = () => check([page], appinfoOf(['HEALTH_STEPS_MODE']));

    expect(call).not.toThrow();
  });

  /** The watch holds one default for a key on every platform, so a round watch's picker opening on another theme would start wrong there. */
  test('refuses a key that opens with two defaults across the platforms', () => {
    const rectangle = pageOf([{ ...select('APPEARANCE_THEME', [0, 1, 2]), defaultValue: 0 }]);
    const round = pageOf([{ ...select('APPEARANCE_THEME', [0, 1, 2]), defaultValue: 2 }], { platform: 'gabbro' });

    const call = () => check([rectangle, round], appinfoOf(['APPEARANCE_THEME']));

    expect(call).toThrow("my-face's settings page gives APPEARANCE_THEME two defaults, 0 and 2. The watch keeps one default for a key on every platform, so give each control on APPEARANCE_THEME the same default");
  });

  /**
   * A face's own field reads its default from the header only if it names it, so a key whose round and
   * rectangular pages open on different values gets no default rather than stopping the build. A field
   * that does name it stops at compile with the default undeclared.
   */
  test('leaves out a face\'s own key that opens on different values on different platforms', () => {
    const rectangle = pageOf([{ ...select('LAYOUT_NIGHT_MODE', [0, 1, 2]), defaultValue: 0 }]);
    const round = pageOf([{ ...select('LAYOUT_NIGHT_MODE', [0, 1, 2]), defaultValue: 1 }], { platform: 'gabbro' });

    const call = () => check([rectangle, round], appinfoOf(['LAYOUT_NIGHT_MODE']));
    const result = pageFacts([rectangle, round]);

    expect(call).not.toThrow();
    expect(result.defaults).not.toHaveProperty('LAYOUT_NIGHT_MODE');
    expect(result.unsettled).toEqual(['LAYOUT_NIGHT_MODE']);
  });

  /** Two controls on one page opening on different values leave the page itself unsure which it saves, so a face's own key still stops there. */
  test('refuses a face\'s own key that opens on two values on one platform', () => {
    const page = pageOf([{ ...select('LAYOUT_NIGHT_MODE', [0, 1, 2]), defaultValue: 0 }, { type: 'hiddenStore', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: '2' }]);

    const call = () => check([page], appinfoOf(['LAYOUT_NIGHT_MODE']));

    expect(call).toThrow("my-face's settings page gives LAYOUT_NIGHT_MODE two defaults, 0 and 2. The watch keeps one default for a key on every platform, so give each control on LAYOUT_NIGHT_MODE the same default");
  });

  /**
   * The phone reads a hidden store's "0" and a select's 0 as the same choice, and a toggle's true and
   * a store's "1" as the same switch, so a page that writes one default two ways is not two defaults.
   */
  test('takes one default written two ways on a key', () => {
    const page = pageOf([
      { type: 'hiddenStore', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: '0' },
      { ...select('LAYOUT_NIGHT_MODE', [0, 1, 2]), defaultValue: 0 },
      { type: 'toggle', messageKey: 'CONNECTION_BLUETOOTH_ICON', defaultValue: true },
      { type: 'hiddenStore', messageKey: 'CONNECTION_BLUETOOTH_ICON', defaultValue: '1' },
    ]);

    const call = () => check([page], appinfoOf(['LAYOUT_NIGHT_MODE', 'CONNECTION_BLUETOOTH_ICON']));

    expect(call).not.toThrow();
    expect(pageFacts([page]).defaults).toEqual({ LAYOUT_NIGHT_MODE: '0', CONNECTION_BLUETOOTH_ICON: '1' });
  });

  /**
   * A visibleWhen row only hides on the page, and Clay still saves it with every other setting, so a
   * row hidden by an in or a notIn condition still counts and still gives the watch its default.
   */
  test('reads a row behind an in or a notIn condition like any other', () => {
    const page = pageOf([
      { ...select('WEATHER_PROVIDER', ['openmeteo', 'owm']), defaultValue: 'openmeteo' },
      { ...select('WEATHER_WIND_UNIT', [0, 1, 2, 3]), defaultValue: 2, visibleWhen: { key: 'WEATHER_PROVIDER', notIn: ['owm'] } },
      { type: 'toggle', messageKey: 'LOCATION_USE_GPS', defaultValue: true, visibleWhen: [{ key: 'WEATHER_PROVIDER', in: ['owm'] }, { key: 'WEATHER_WIND_UNIT', notIn: [3] }] },
    ]);

    const call = () => check([page], appinfoOf(['WEATHER_PROVIDER', 'WEATHER_WIND_UNIT', 'LOCATION_USE_GPS'], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' }));

    expect(call).not.toThrow();
    expect(pageFacts([page])).toMatchObject({ counts: { WEATHER_WIND_UNIT: 4 }, defaults: { WEATHER_WIND_UNIT: '2', LOCATION_USE_GPS: '1' } });
  });

  /**
   * The watch holds four vibes whatever the page lists. A page with a fifth option opening on it passes
   * the page's own count, and a fresh watch would start on a vibe it cannot play.
   */
  test('refuses a shared entry\'s default past the framework\'s own count', () => {
    const page = pageOf([{ ...select('CONNECTION_VIBE_CONNECT', [0, 1, 2, 3, 4]), defaultValue: 4 }]);

    const call = () => check([page], appinfoOf(['CONNECTION_VIBE_CONNECT']));

    expect(call).toThrow("my-face's settings page defaults CONNECTION_VIBE_CONNECT to 4, but the watch's shared entry for CONNECTION_VIBE_CONNECT holds 4 choices, from 0 to 3. The watch puts a choice past them back to its default, so make the default one of those");
  });

  /** A wearer who picks a fifth vibe the watch cannot hold gets the default back, with nothing to say why. */
  test('refuses a shared entry\'s option past the framework\'s own count', () => {
    const page = pageOf([{ ...select('CONNECTION_VIBE_CONNECT', [0, 1, 2, 3, 4]), defaultValue: 0 }]);

    const call = () => check([page], appinfoOf(['CONNECTION_VIBE_CONNECT']));

    expect(call).toThrow("my-face's settings page offers 4 for CONNECTION_VIBE_CONNECT, but the watch's shared entry for CONNECTION_VIBE_CONNECT holds 4 choices, from 0 to 3. A wearer who picks it gets the default back, so take the option off the page");
  });

  /** A page can list the framework's choices in any order and leave some out, as long as each is one the watch holds. */
  test('takes a shared entry\'s options in any order below the framework\'s own count', () => {
    const page = pageOf([{ ...select('CLOCK_TIME_FORMAT', [0, 1, 4, 2]), defaultValue: 0 }]);

    const call = () => check([page], appinfoOf(['CLOCK_TIME_FORMAT']));

    expect(call).not.toThrow();
  });

  /** A shared entry that keeps a number would otherwise stop the C on a string handed to an integer, far from the page that caused it. */
  test('refuses text as the default of a shared entry that keeps a number', () => {
    const page = pageOf([{ ...select('CLOCK_TIME_FORMAT', ['12h', '24h']), defaultValue: '12h' }]);

    const call = () => check([page], appinfoOf(['CLOCK_TIME_FORMAT']));

    expect(call).toThrow("my-face's settings page defaults CLOCK_TIME_FORMAT to \"12h\", but the watch's shared entry for CLOCK_TIME_FORMAT keeps a number. Make the default a whole number");
  });

  /** The date format keeps text, so a numbered date select would hand the C a number where it wants a string. */
  test('refuses a number as the default of a shared entry that keeps text', () => {
    const page = pageOf([{ ...select('CLOCK_DATE_FORMAT', [0, 1]), defaultValue: 0 }]);

    const call = () => check([page], appinfoOf(['CLOCK_DATE_FORMAT']));

    expect(call).toThrow("my-face's settings page defaults CLOCK_DATE_FORMAT to 0, but the watch's shared entry for CLOCK_DATE_FORMAT keeps text. Make the default text");
  });

  /**
   * The watch keeps the date format in 16 bytes, the end of the text included. A default past that is
   * cut short on a fresh watch, so it would show a different date from the one the page opens on. An
   * accented letter takes two of the bytes.
   */
  test('refuses a text default too long for its shared entry\'s buffer, counted in UTF-8 bytes', () => {
    const long = pageOf([{ ...select('CLOCK_DATE_FORMAT', ['é %A %d %B %Y..']), defaultValue: 'é %A %d %B %Y..' }]);

    const call = () => check([long], appinfoOf(['CLOCK_DATE_FORMAT']));

    expect(call).toThrow("my-face's settings page defaults CLOCK_DATE_FORMAT to \"é %A %d %B %Y..\", which is 16 bytes, but the watch keeps CLOCK_DATE_FORMAT in 16 bytes, room for 15 and the end of the text. Make the default 15 bytes or shorter");
  });

  /** A default of exactly 15 bytes fills the buffer with its end and reaches the watch whole. */
  test('takes a text default that just fits its shared entry buffer', () => {
    const page = pageOf([{ ...select('CLOCK_DATE_FORMAT', ['%A %d %B %Y....']), defaultValue: '%A %d %B %Y....' }]);

    const call = () => check([page], appinfoOf(['CLOCK_DATE_FORMAT']));

    expect(call).not.toThrow();
  });

  /** The watch puts a choice past its count back to the default, so a default past it would be put back and saved on every launch. */
  test('refuses a default past the count of its key', () => {
    const page = pageOf([select('APPEARANCE_THEME', [0, 1, 2]), { type: 'input', messageKey: 'APPEARANCE_THEME', defaultValue: '7' }]);

    const call = () => check([page], appinfoOf(['APPEARANCE_THEME']));

    expect(call).toThrow("my-face's settings page defaults APPEARANCE_THEME to 7, but its choices run from 0 to 2. The watch puts a choice past them back to its default, so it would put this one back and save it again on every launch. Make the default one of the choices");
  });

  /** The build writes the watch's weather source from the providers list alone, so a picker that lacks it would start the watch on a source the page cannot show. */
  test('refuses a plugin source default the face\'s own picker does not offer', () => {
    const page = pageOf([{ ...select('WEATHER_PROVIDER', ['owm', 'weatherapi']), defaultValue: 'owm' }]);

    const call = () => check([page], appinfoOf(['WEATHER_PROVIDER'], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' }));

    expect(call).toThrow("my-face's own WEATHER_PROVIDER picker does not offer openmeteo, which the watch starts on as its weather source. The build takes it from the first custom provider in providers.weather, or openmeteo with no list. Offer openmeteo in the picker, or list one it offers first in providers.weather");
  });

  /** A watch that never got a save sends its default back, which would move a fresh install off the source the page opened on. */
  test('refuses a page that opens on another source than the watch starts on', () => {
    const page = pageOf([{ ...select('WEATHER_PROVIDER', ['openmeteo', 'owm']), defaultValue: 'owm' }]);

    const call = () => check([page], appinfoOf(['WEATHER_PROVIDER'], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' }));

    expect(call).toThrow("my-face's settings page opens with WEATHER_PROVIDER on \"owm\", but the watch starts on \"openmeteo\" until the first save. The build takes it from the first custom provider in providers.weather, or openmeteo with no list, so list the providers in providers.weather with \"owm\" first");
  });

  /**
   * The phone matches a provider without regard to case and keeps the picker's own spelling, so a
   * picker whose option saves OpenMeteo offers and opens on the openmeteo the build writes.
   */
  test('matches a plugin source default to the picker without regard to case', () => {
    const page = pageOf([{ ...select('WEATHER_PROVIDER', ['OpenMeteo', 'OWM']), defaultValue: 'OpenMeteo' }]);

    const call = () => check([page], appinfoOf(['WEATHER_PROVIDER'], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' }));

    expect(call).not.toThrow();
  });

  /** A face whose page and providers list agree builds, whichever kinds it keeps. */
  test('takes a plugin source default the picker offers and the page opens on', () => {
    const page = pageOf([{ ...select('WEATHER_PROVIDER', ['openmeteo', 'owm']), defaultValue: 'owm' }]);

    const call = () => check([page], appinfoOf(['WEATHER_PROVIDER'], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm', PLUGIN_SOURCE_CALENDAR_DEFAULT: 'ical' }));

    expect(call).not.toThrow();
  });
});

describe('largestCounts', () => {
  /** The page is loaded for each platform, and the watch's table has to take whichever platform offers the most. */
  test('takes the largest count for each key across the pages', () => {
    const result = largestCounts([{ APPEARANCE_THEME: 3, CLOCK_WEEK_START: 2 }, { APPEARANCE_THEME: 4, HEALTH_STEPS_MODE: 3 }]);

    expect(result).toEqual({ APPEARANCE_THEME: 4, CLOCK_WEEK_START: 2, HEALTH_STEPS_MODE: 3 });
  });
});

describe('platformsOf', () => {
  /** A face that names its platforms is built for those alone, so its page is counted on those alone. */
  test('takes the platforms the appinfo lists', () => {
    const result = platformsOf({ targetPlatforms: ['gabbro', 'emery'] });

    expect(result).toEqual(['gabbro', 'emery']);
  });

  /**
   * The SDK builds every platform it has for a face that names none, so counting on one watch alone
   * would hold the others to that watch's page.
   */
  test.each([[{}], [{ targetPlatforms: [] }]])('counts a face that lists no platforms, %j, on every one the SDK builds', (appinfo) => {
    const result = platformsOf(appinfo);

    expect(result).toEqual(['aplite', 'basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro']);
    expect(result).not.toBe(PEBBLE_PLATFORMS);
  });
});

describe('settingsPageHeader', () => {
  /** The same page has to write the same header, or waf would rebuild every file that includes it on each build. */
  test('writes the counts and then the defaults sorted by key, after the fingerprint and the platforms', () => {
    const facts = { counts: { APPEARANCE_THEME: 9, APPEARANCE_HEADER_FONT: 8 }, defaults: { CLOCK_DATE_FORMAT: '"%b %d"', APPEARANCE_THEME: '3' }, unsettled: [], platforms: ['emery', 'gabbro'], controls: [] };

    const result = settingsPageHeader('my-face', facts, ANY_FINGERPRINT);

    expect(result).toBe([
      "// written by paf build from my-face's settings page. never edit or commit it",
      '// format: 2',
      `// sandbox fingerprint: ${ANY_FINGERPRINT}`,
      '// counted on: emery gabbro',
      '#pragma once',
      '',
      '#define SETTINGS_COUNT_APPEARANCE_HEADER_FONT 8',
      '#define SETTINGS_COUNT_APPEARANCE_THEME 9',
      '',
      '#define SETTINGS_DEFAULT_APPEARANCE_THEME 3',
      '#define SETTINGS_DEFAULT_CLOCK_DATE_FORMAT "%b %d"',
      '',
    ].join('\n'));
  });

  /** A face with no settings page still includes the header through settings_catalog.h, so it has to be there and hold nothing. */
  test('writes a header with no counts for a face with no settings page', () => {
    const result = settingsPageHeader('my-face', pageFacts([]), ANY_FINGERPRINT);

    expect(result).toBe(`// written by paf build from my-face's settings page. never edit or commit it\n// format: 2\n// sandbox fingerprint: ${ANY_FINGERPRINT}\n#pragma once\n`);
  });
});

describe('captureStart', () => {
  /** A host whose real startPebbleApp records that it ran, so a spec can see whether it was put back. */
  function recordingHost(): { host: StartHost; realCalls: StartOptions[] } {
    const realCalls: StartOptions[] = [];
    const host: StartHost = { startPebbleApp: (options) => { realCalls.push(options); } };

    return { host, realCalls };
  }

  /**
   * The point of the capture. The page is built from exactly what the face passes, so a component
   * left out of startPebbleApp is missing here too, the way it is on the phone.
   */
  test('hands back what the face passed to startPebbleApp', () => {
    const { host } = recordingHost();
    const passed: StartOptions = { clayConfig: [{ type: 'heading', defaultValue: 'Page' }], components: ['layout'], customClay: 'reset' };

    const result = captureStart(host, () => host.startPebbleApp(passed));

    expect(result).toBe(passed);
  });

  /** The face's start-up must never reach the real startPebbleApp, which would wire phone events under node. */
  test('keeps the real startPebbleApp from running', () => {
    const { host, realCalls } = recordingHost();

    captureStart(host, () => host.startPebbleApp({ clayConfig: [] }));

    expect(realCalls).toHaveLength(0);
  });

  /** clay-preview's --watch loads the face again, so the real call has to be back after a failed load. */
  test('puts the real startPebbleApp back when the load throws', () => {
    const { host } = recordingHost();
    const real = host.startPebbleApp;
    const load = () => { throw new Error('bad face'); };

    const result = () => captureStart(host, load);

    expect(result).toThrow('bad face');
    expect(host.startPebbleApp).toBe(real);
  });

  /** A face whose start-up never starts has no page the phone would build, so the build writes no counts for it. */
  test('hands back null for a face that never calls startPebbleApp', () => {
    const { host } = recordingHost();

    const result = captureStart(host, () => {});

    expect(result).toBeNull();
  });
});

describe('messageKeysFrom', () => {
  /**
   * clay-preview and page-check load a page on this map, not on the build's. A face that leaves its
   * plugin select key to the define would preview with the plugin choice left off its page.
   */
  test('adds the keys the plugin defines bring after the face\'s own', () => {
    const dir = path.join(tempDir('keys-from-'), 'my-face');
    const file = path.join(dir, 'pebble.appinfo.json');

    fs.mkdirSync(dir);
    fs.writeFileSync(file, JSON.stringify({ messageKeys: ['SETTINGS_REQUEST', 'SETTINGS_FRESH'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin', 'openmeteo'] } }));

    const result = messageKeysFrom(file);

    expect(result).toEqual({ SETTINGS_REQUEST: 10000, SETTINGS_FRESH: 10001, WEATHER_REQUEST: 10002, WEATHER_TEMPERATURE: 10003, WEATHER_CONDITIONS: 10004, WEATHER_OK: 10005, WEATHER_PROVIDER: 10006 });
  });

  /** A define the build would refuse stops the preview with the build's own line, naming the face by its folder. */
  test('refuses a define the build refuses', () => {
    const dir = path.join(tempDir('keys-from-'), 'my-face');
    const file = path.join(dir, 'pebble.appinfo.json');

    fs.mkdirSync(dir);
    fs.writeFileSync(file, JSON.stringify({ messageKeys: [], defines: { PLUGIN_WEATHER: 'on' } }));

    const call = () => messageKeysFrom(file);

    expect(call).toThrow("my-face's appinfo defines PLUGIN_WEATHER as \"on\", which is not a whole number");
  });
});

describe('startFacts', () => {
  /**
   * A sandbox with a stand-in app module, whose startPebbleApp does nothing and whose page calls hand
   * back the page the face gave, and the face's index.js as given.
   */
  function fakeSandbox(index: string): FacePaths {
    const sandbox = tempDir('start-facts-');
    const emit = path.join(sandbox, 'emit');
    const emitPkjs = path.join(emit, 'face', 'src', 'pkjs');
    const appDir = path.join(emit, 'paf', 'ts', 'pkjs');

    fs.mkdirSync(emitPkjs, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'app.js'), [
      'exports.default = { startPebbleApp() {} };',
      'exports.faceStart = (options) => ({ options, defaults: {}, providers: null, hooks: [], fallbackPage: (config) => config });',
      "exports.createClay = (options) => ({ config: options.clayConfig || [], customFn: null, generateUrl: () => '' });",
      'exports.prepareSettingsPage = () => {};',
      'exports.SETTINGS_REFETCH_DELAY_MS = 0;',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(emitPkjs, 'index.js'), `const app = require('../../../paf/ts/pkjs/app.js').default;\nconst keys = require('message_keys');\n${index}\n`);

    return { emit, emitPkjs, pluginSources: path.join(emit, 'paf', 'ts', 'plugin-sources') } as FacePaths;
  }

  /** A feature that carries the given keys. */
  const feature = (name: string, keys: string[]): string => `const ${name} = () => ({});\n${name}.messageKeys = ${JSON.stringify(keys)};\n`;

  /** A feature passed on a round watch alone still ships in the one pbw, so its keys have to be in it. */
  test('reads the features on every platform the face builds for', () => {
    const paths = fakeSandbox(`${feature('rect', ['RECT_KEY'])}${feature('round', ['ROUND_KEY'])}app.startPebbleApp({ clayConfig: [], features: Pebble.platform === 'gabbro' ? [round] : [rect] });`);

    const result = startFacts(paths, 'face', [], ['emery', 'gabbro']);

    expect(result).toEqual({ started: true, featureKeys: ['RECT_KEY', 'ROUND_KEY'] });
  });

  /** The phone runs the features of every call, so a second call's feature needs its keys too. */
  test('reads the features of every startPebbleApp call', () => {
    const paths = fakeSandbox(`${feature('first', ['FIRST_KEY'])}${feature('second', ['SECOND_KEY'])}app.startPebbleApp({ clayConfig: [], features: [first] });\napp.startPebbleApp({ clayConfig: [], features: [second] });`);

    const result = startFacts(paths, 'face', [], ['emery']);

    expect(result).toEqual({ started: true, featureKeys: ['FIRST_KEY', 'SECOND_KEY'] });
  });

  /**
   * A face can pass a feature only beside another one's key. Read once on the face's own keys, the
   * second feature would never show and its keys would be left out.
   */
  test('reads again with the keys it found until nothing new turns up', () => {
    const paths = fakeSandbox(`${feature('base', ['BASE_KEY'])}${feature('extra', ['EXTRA_KEY'])}app.startPebbleApp({ clayConfig: [], features: keys.BASE_KEY === undefined ? [base] : [base, extra] });`);

    const result = startFacts(paths, 'face', ['SETTINGS_REQUEST'], ['emery']);

    expect(result).toEqual({ started: true, featureKeys: ['BASE_KEY', 'EXTRA_KEY'] });
  });

  /** A face whose features change with every key it is given would never settle, and the build cannot say what it ships. */
  test('refuses features that bring new keys on every read', () => {
    const paths = fakeSandbox(`const count = Object.keys(keys).length;\nconst grow = () => ({});\ngrow.messageKeys = ['KEY_' + count];\napp.startPebbleApp({ clayConfig: [], features: [grow] });`);

    const call = () => startFacts(paths, 'face', [], ['emery']);

    expect(call).toThrow("face's phone code passes features that bring new message keys each time the build reads it");
  });

  /** A bare stack from node says nothing about which face or why, so the line has to name both. */
  test('names the face when its code throws as it loads', () => {
    const paths = fakeSandbox("throw new Error('fetch is not defined');");

    const call = () => startFacts(paths, 'my-face', [], ['emery']);

    expect(call).toThrow("my-face's phone code threw while the build loaded it: fetch is not defined. The build loads it under node on a phone with only");
  });

  /** The page load runs the face's code too, so a throw there has to name the face the same way. */
  test('names the face when its code throws as its page loads', () => {
    const paths = fakeSandbox("throw new Error('fetch is not defined');");

    const call = () => loadSettingsPage(paths, {}, true, { face: 'my-face' });

    expect(call).toThrow("my-face's phone code threw while the build loaded it: fetch is not defined");
  });

  /** The first read has none of the features' keys yet, so a face whose code needs one as it loads has to hear why it threw. */
  test('says the first read runs before the features\' keys are known', () => {
    const paths = fakeSandbox("if (keys.WEATHER_OK === undefined) { throw new Error('no WEATHER_OK'); }");

    const call = () => startFacts(paths, 'my-face', [], ['emery']);

    expect(call).toThrow("This was the build's first read of the code, which runs before it knows the keys the features bring, so a key the code needs as it loads has to be listed in messageKeys.");
  });

  /**
   * A feature wrapped in a function of the face's own hides the keys the framework's feature carries,
   * so the build adds none, and the watch never sends the request the feature waits for.
   */
  test('refuses a feature that answers a request the keys do not carry, as the build loads the page', () => {
    const paths = fakeSandbox("const wrapped = () => ({ requests: ['WEATHER_REQUEST'] });\napp.startPebbleApp({ clayConfig: [], features: [wrapped] });");

    const call = () => loadAsPreview(paths, { SETTINGS_REQUEST: 10000 }, { face: 'my-face', checks: true, keysWhole: true });

    expect(call).toThrow('my-face passes startPebbleApp a feature that answers WEATHER_REQUEST, but its message keys do not carry WEATHER_REQUEST');
  });

  /** clay-preview and page-check open a page the build would refuse, so the refusal is the build's alone. */
  test('opens the same page without the build\'s checks', () => {
    const paths = fakeSandbox("const wrapped = () => ({ requests: ['WEATHER_REQUEST'] });\napp.startPebbleApp({ clayConfig: [], features: [wrapped] });");

    const result = loadAsPreview(paths, {}, { face: 'my-face', keysWhole: true });

    expect(result?.features).toEqual([{ requests: ['WEATHER_REQUEST'] }]);
  });

  /** The build's keys already hold the features' keys, so reading the start again on every platform's page load would double the face's loads for nothing. */
  test('reads the start before the page only when the keys are not whole', () => {
    const paths = fakeSandbox('globalThis.pageLoads = (globalThis.pageLoads || 0) + 1;\napp.startPebbleApp({ clayConfig: [], features: [] });');
    const host = globalThis as unknown as { pageLoads?: number };

    host.pageLoads = 0;
    loadAsPreview(paths, {}, { face: 'my-face', keysWhole: true });
    const whole = host.pageLoads;

    host.pageLoads = 0;
    loadAsPreview(paths, {}, { face: 'my-face' });
    const result = [whole, host.pageLoads];

    delete host.pageLoads;
    expect(result).toEqual([1, 2]);
  });

  /** A face that starts later, in a callback, would build with none of its features' keys and no settings page, and nothing would say why. */
  test('warns when the face\'s code never calls startPebbleApp as it loads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const paths = fakeSandbox('setTimeout(() => app.startPebbleApp({ clayConfig: [] }), 0);');

    startFacts(paths, 'my-face', [], ['emery']);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("my-face's phone code has an index.js that never calls startPebbleApp as it loads"));
    warn.mockRestore();
  });

  /**
   * The bug this pins. A real interval started as the face's code loads keeps node running after the
   * build is done, so paf build would never return. The read runs in a node of its own, which has to
   * end by itself.
   */
  test('holds a timer the face starts as it loads, so node still ends', () => {
    const paths = fakeSandbox("setInterval(() => { process.stdout.write('tick'); }, 1);\nsetTimeout(() => { process.stdout.write('tock'); }, 1);\napp.startPebbleApp({ clayConfig: [], features: [] });");
    const loader = pathToFileURL(path.join(import.meta.dirname, 'settings-page.ts')).href;
    const script = `import { startFacts } from ${JSON.stringify(loader)};\nconst result = startFacts(${JSON.stringify(paths)}, 'face', [], ['emery']);\nprocess.stdout.write(JSON.stringify(result));`;

    const result = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('{"started":true,"featureKeys":[]}');
  });
});

describe('installHost', () => {
  /**
   * The build loads every face in one process, so a phone left behind would hand the next face the
   * last one's saved state, and node's own localStorage would stay hidden after the build.
   */
  test('puts every global it set back as it was', () => {
    const host = globalThis as unknown as Record<string, unknown>;
    const names = ['Pebble', 'localStorage', 'window', 'navigator'];
    const before = names.map((name) => Object.getOwnPropertyDescriptor(host, name));

    const restore = installHost({ platform: 'gabbro', settings: null }, null);

    restore();

    const result = names.map((name) => Object.getOwnPropertyDescriptor(host, name));

    expect(result).toEqual(before);
  });
});

describe('loading a face page', () => {
  /** Builds a fixture face the way the build does, into its own sandbox under build/. */
  function buildFixture(name: string, defines: Record<string, number>): FacePaths {
    const place: FacePlace = { root: ENGINE, rel: path.relative(ENGINE, path.join(FIXTURES, name)).split(path.sep).join('/'), sandbox: path.join(OUT_DIR, name) };
    const paths = facePaths(name, name, place);

    cleanEmit(paths);
    writeTsconfig(name, paths, place);
    compile(paths);
    fillEmit(paths, [], defines);

    return paths;
  }

  /** A fixture's message keys, as the build stands them in. */
  function keysOf(name: string): Record<string, number> {
    return messageKeysFrom(path.join(FIXTURES, name, 'pebble.appinfo.json'));
  }

  let face: FacePaths;
  let noPage: FacePaths;
  let platforms: FacePaths;

  beforeAll(() => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
    face = buildFixture('face', { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 });
    noPage = buildFixture('no-page-face', {});
    platforms = buildFixture('platform-face', {});
  }, 120_000);

  afterAll(() => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  });

  /**
   * The page the build counts is the one the phone opens. The fixture's own refresh interval and the
   * builder's temperature unit count, and the providers and the plugin choice the features add are
   * text, so they do not.
   */
  test('counts the choices on the page the phone opens', () => {
    const loaded = loadOnPlatforms(face, keysOf('face'), ['emery'], 'face');

    const result = pageFacts(loaded).counts;

    expect(result).toEqual({ CALENDAR_POLL: 3, WEATHER_TEMPERATURE_UNIT: 2 });
  });

  /**
   * The features start and their page hooks run, as on the phone. A face built with PLUGIN_WEATHER
   * gets the weather feature's rows, which the page Clay was built with does not have.
   */
  test('runs the features and their page hooks', () => {
    const [loaded] = loadOnPlatforms(face, keysOf('face'), ['emery'], 'face');

    const result = JSON.stringify(loaded.clay.config).length > JSON.stringify(loaded.built.config).length;

    expect(loaded.features.length).toBe(2);
    expect(result).toBe(true);
  });

  /** A round watch offered a theme a rectangular one is not would have that theme turned away by a count taken from one watch only. */
  test('takes the largest count across the platforms the face targets', () => {
    const loaded = loadOnPlatforms(platforms, keysOf('platform-face'), ['emery', 'gabbro'], 'platform-face');

    const result = pageFacts(loaded).counts;

    expect(loaded).toHaveLength(2);
    expect(result).toEqual({ APPEARANCE_THEME: 4, CLOCK_WEEK_START: 2 });
  });

  /**
   * paf build all loads every face in one process. Each one has to start on a clean phone, and node's
   * own globals have to be back once the faces are done.
   */
  test('loads two faces in a row on clean phones and puts the globals back', () => {
    const host = globalThis as unknown as Record<string, unknown>;
    const names = ['Pebble', 'localStorage', 'window', 'navigator'];
    const before = names.map((name) => Object.getOwnPropertyDescriptor(host, name));

    const first = pageFacts(loadOnPlatforms(face, keysOf('face'), ['emery'], 'face')).counts;
    const second = pageFacts(loadOnPlatforms(noPage, keysOf('no-page-face'), ['emery'], 'no-page-face')).counts;
    const result = names.map((name) => Object.getOwnPropertyDescriptor(host, name));

    expect(first).toEqual({ CALENDAR_POLL: 3, WEATHER_TEMPERATURE_UNIT: 2 });
    expect(second).toEqual({});
    expect(result).toEqual(before);
  });

  /**
   * The defaults the header writes are the ones the page opens with, after the features' hooks, so
   * the weather source is the one the build's providers list gives and the fixture's own refresh
   * interval keeps the default its select names.
   */
  test('reads the defaults of the page the phone opens', () => {
    const loaded = loadOnPlatforms(face, keysOf('face'), ['emery'], 'face');

    const result = pageFacts(loaded).defaults;

    expect(result).toMatchObject({ CALENDAR_POLL: '1', WEATHER_PROVIDER: '"openmeteo"', WEATHER_TEMPERATURE_UNIT: '0', LOCATION_USE_GPS: '0' });
  });

  /**
   * The framework's own rows have to pass the checks it holds every face to, or a face built with a
   * plugin define would be refused for rows it never wrote.
   */
  test('passes the fixture faces, framework rows and all, through the page checks', () => {
    const fixtures: Array<[FacePaths, string, string[], Record<string, number>]> = [
      [face, 'face', ['emery'], { PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }],
      [noPage, 'no-page-face', ['emery'], {}],
      [platforms, 'platform-face', ['emery', 'gabbro'], {}],
    ];

    const result = () => fixtures.forEach(([paths, name, targets, defines]) => {
      const appinfo = JSON.parse(fs.readFileSync(path.join(FIXTURES, name, 'pebble.appinfo.json'), 'utf8'));

      const pages = loadOnPlatforms(paths, keysOf(name), targets, name);

      checkPage(name, pages, pageFacts(pages), { messageKeys: appinfo.messageKeys, textDefines: pluginSourceDefaults(defines, {}) });
    });

    expect(result).not.toThrow();
  });

  /** A face that passes an empty page still loads, and writes a header with no counts for its C to include. */
  test('writes no counts for a face that passes an empty page', () => {
    const loaded = loadOnPlatforms(noPage, keysOf('no-page-face'), ['emery'], 'no-page-face');

    const result = pageFacts(loaded).counts;

    expect(loaded).toHaveLength(1);
    expect(result).toEqual({});
  });

  /**
   * A face that leaves the weather and calendar keys to the features has to load the same page as one
   * that lists them. Without them the weather feature starts on nothing and its page hook never runs.
   */
  test('adds the keys the features need before they start, as clay-preview loads the page', () => {
    const brought = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'CALENDAR_REQUEST', 'CALENDAR_STRIP'];
    const keys = messageKeysOf({ messageKeys: Object.keys(keysOf('face')).filter((key) => !brought.includes(key)) });
    const listed = loadOnPlatforms(face, keysOf('face'), ['emery'], 'face');

    const loaded = loadAsPreview(face, keys, { face: 'face' });

    expect(Object.keys(keys)).toEqual(expect.arrayContaining(brought));
    expect(JSON.stringify(loaded?.clay.config)).toBe(JSON.stringify(listed[0].clay.config));
  });

  /** The build adds the keys the features carry, so a start read that missed one would build a face without it. */
  test('reads the keys the features need and that the face starts', () => {
    const appinfo = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'face', 'pebble.appinfo.json'), 'utf8'));

    const result = startFacts(face, 'face', appinfo.messageKeys, ['emery']);

    expect(result).toEqual({ started: true, featureKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'CALENDAR_REQUEST', 'CALENDAR_STRIP'] });
  });

  /** A face with no phone code adds no feature keys and no settings page capability, rather than stopping the build. */
  test('reads nothing from a sandbox with no index.js', () => {
    const paths = facePaths('none', 'none', { root: ENGINE, rel: 'plugins/dev/fixtures/none', sandbox: path.join(OUT_DIR, 'none') });

    const result = startFacts(paths, 'none', [], ['emery']);

    expect(result).toEqual({ started: false, featureKeys: [] });
  });

  /** A face with no phone code of its own has no settings page, and the build has to go on to an empty header rather than stop. */
  test('hands back no page for a sandbox with no index.js', () => {
    const paths = facePaths('none', 'none', { root: ENGINE, rel: 'plugins/dev/fixtures/none', sandbox: path.join(OUT_DIR, 'none') });

    const result = loadSettingsPage(paths, {}, true);

    expect(result).toBeNull();
  });
});

describe.skipIf(findPython() === null)('the waf build reading the header', () => {
  const python = findPython() as string;
  const sandbox = path.join(OUT_DIR, 'header-sandbox');

  afterAll(() => {
    fs.rmSync(OUT_DIR, { recursive: true, force: true });
  });

  /**
   * What paf_build says about the sandbox's header when it builds the given platforms, or an empty line
   * when it takes the header. It runs the same two checks build_face runs, in the same order.
   */
  function wafSays(building: string[] = ['emery']): string {
    const code = 'import sys; sys.path.insert(0, sys.argv[1]); import paf_build; '
      + 'print(paf_build.page_header_problem(sys.argv[2]) or paf_build.page_platforms_problem(sys.argv[2], sys.argv[3].split()) or "")';
    // no bytecode, so the spec leaves no __pycache__ beside the waf helpers
    const run = spawnSync(python, ['-c', code, WAF_DIR, sandbox, building.join(' ')], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });

    return run.stdout.trim();
  }

  /** Writes a small sandbox and the header the build would write for it, counted on emery. */
  function writeSandbox(): void {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.join(sandbox, 'emit', 'src', 'pkjs'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'package.json'), '{"name":"my-face"}\n');
    fs.writeFileSync(path.join(sandbox, 'emit', 'src', 'pkjs', 'index.js'), 'startPebbleApp({});\n');
    fs.writeFileSync(path.join(sandbox, 'emit', 'src', 'pkjs', 'config.js'), 'module.exports = [];\n');
    fs.mkdirSync(path.join(sandbox, 'page'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'page', 'settings_page.h'), settingsPageHeader('my-face', { counts: { APPEARANCE_THEME: 4 }, defaults: {}, unsettled: [], platforms: ['emery'], controls: [] }, sandboxFingerprint(sandbox)));
  }

  /** The two sides work the fingerprint out in two languages, so a drift between them would stop every build. */
  test('takes the header paf build wrote for the sandbox', () => {
    writeSandbox();

    const result = wafSays();

    expect(result).toBe('');
  });

  /** Phone code compiled again after the header was written would leave the C holding counts from a page the face no longer ships. */
  test('refuses a header written before the phone code changed', () => {
    writeSandbox();
    fs.writeFileSync(path.join(sandbox, 'emit', 'src', 'pkjs', 'config.js'), 'module.exports = [{ type: "select" }];\n');

    const result = wafSays();

    expect(result).toBe('page/settings_page.h was written for another build of this sandbox. Build the face with paf build, which writes it.');
  });

  /**
   * An SDK that builds a platform the build did not count the page on would hand that platform the
   * other platforms' counts, which a theme only it offers would fall past.
   */
  test('refuses a build for a platform the page was not counted on', () => {
    writeSandbox();

    const result = wafSays(['emery', 'gabbro']);

    expect(result).toBe("page/settings_page.h counts the settings page as it opens on emery, but this build also makes the face for gabbro. List the face's platforms in its appinfo's targetPlatforms.");
  });

  /**
   * A header from a framework before the defaults has the same fingerprint, so without a format line
   * the waf build would take it and the face's C would build on its own defaults again.
   */
  test('refuses a header with no format line', () => {
    writeSandbox();

    const file = path.join(sandbox, 'page', 'settings_page.h');

    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('// format: 2\n', ''));

    const result = wafSays();

    expect(result).toBe('page/settings_page.h was written by another version of paf build. Build the face with paf build, which writes it.');
  });

  /** A sandbox no paf build ever wrote a header into has no counts at all for the C to read. */
  test('refuses a sandbox with no header', () => {
    writeSandbox();
    fs.rmSync(path.join(sandbox, 'page'), { recursive: true });

    const result = wafSays();

    expect(result).toBe('No page/settings_page.h in this sandbox. Build the face with paf build, which writes it.');
  });
});
