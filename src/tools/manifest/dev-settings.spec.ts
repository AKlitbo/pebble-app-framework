/**
 * Specs for the settings a dev build applies from paf.dev.config.json.
 *
 * The watch writes them into a dictionary sized by the build, so the count has to match the SDK's
 * or the last setting falls off the end. A toggle has to reach the catalogue as the number it keeps,
 * and a key the face does not declare has to stop the build with its name.
 */
import { describe, expect, test } from 'vitest';
import { checkSettingKeys, checkSettingTypes, dictSize, readSettings } from './dev-settings.ts';

const FILE = 'mosaic/paf.dev.config.json';

describe('readSettings', () => {
  /** The catalogue keeps a toggle as 0 or 1, which is what the page's true or false lands as. */
  test('takes a toggle as 1 or 0', () => {
    const result = readSettings({ APPEARANCE_QUIET_TIME_ICON: true, CONNECTION_BLUETOOTH_ICON: false }, FILE, '');

    expect(result).toEqual({ APPEARANCE_QUIET_TIME_ICON: 1, CONNECTION_BLUETOOTH_ICON: 0 });
  });

  /** A dictionary holds a whole number, so a fraction would land rounded somewhere nobody looks. */
  test('refuses a number that is not whole', () => {
    const call = () => readSettings({ APPEARANCE_THEME: 1.5 }, FILE, "gridlock's ");

    expect(call).toThrow(`${FILE} sets gridlock's settings.APPEARANCE_THEME to 1.5. It takes a whole number`);
  });

  /** A key in lowercase is a typo for a message key, which the build would only find as an undeclared name. */
  test('refuses a key that is not a message key', () => {
    const call = () => readSettings({ appearance_theme: 1 }, FILE, '');

    expect(call).toThrow('which is not a message key');
  });
});

describe('checkSettingKeys', () => {
  /** The C names MESSAGE_KEY_ for every setting, so one the face lacks stops the build with nothing to say why. */
  test('refuses a key the face does not declare and names it', () => {
    const call = () => checkSettingKeys({ APPEARANCE_THEME: 1, CLOCK_TIMEZONE_1: '0,Here' }, ['APPEARANCE_THEME'], 'sidereel', 'settings');

    expect(call).toThrow("paf.dev.config.json sets sidereel's settings.CLOCK_TIMEZONE_1, which sidereel does not declare in its messageKeys");
  });
});

describe('dictSize', () => {
  /** One byte for the head, seven a tuple, four for an int32, and the text's bytes and terminator. */
  test('counts a dictionary the way the SDK does', () => {
    const result = dictSize({ APPEARANCE_THEME: 1, CLOCK_TIMEZONE_1: 'é,' });

    expect(result).toBe(23);
  });
});

describe('checkSettingTypes', () => {
  /** A page with a theme select of four, a colour, a toggle, a text box, and the framework's date format. */
  const CATALOGUE = {
    counts: { APPEARANCE_THEME: 4 },
    controls: [
      { key: 'APPEARANCE_THEME', type: 'select' },
      { key: 'APPEARANCE_ACCENT', type: 'color' },
      { key: 'APPEARANCE_QUIET_TIME_ICON', type: 'toggle' },
      { key: 'CLOCK_TIMEZONE_1', type: 'input' },
    ],
    known: { CLOCK_DATE_FORMAT: { field: 'default_str', size: 16 }, CLOCK_TIME_FORMAT: { field: 'default_num', count: 5 } } as const,
  };

  /** The catalogue reads a colour as a number only, so one written as text would be skipped and the old colour kept. */
  test('refuses a colour written as text', () => {
    const call = () => checkSettingTypes({ APPEARANCE_ACCENT: 'FF0000' }, CATALOGUE, 'gridlock', 'settings');

    expect(call).toThrow('paf.dev.config.json sets gridlock\'s settings.APPEARANCE_ACCENT to "FF0000", but it is a colour');
  });

  /** A text field given a number is skipped, so the screenshot shows whatever the emulator last saved. */
  test('refuses a number for a text field', () => {
    const call = () => checkSettingTypes({ CLOCK_TIMEZONE_1: 3 }, CATALOGUE, 'gridlock', 'settings');

    expect(call).toThrow('but it is text');
  });

  /** The watch resets a choice past its count to the default, which would show a different theme with no word. */
  test('refuses a choice past what the page offers', () => {
    const call = () => checkSettingTypes({ APPEARANCE_THEME: 4 }, CATALOGUE, 'gridlock', 'walks.store.steps[3].settings');

    expect(call).toThrow("sets gridlock's walks.store.steps[3].settings.APPEARANCE_THEME to 4, which is past what it holds, 0 to 3");
  });

  /** A framework choice holds no more than its own count, whatever the page lists. */
  test('refuses a framework choice past its own count', () => {
    const call = () => checkSettingTypes({ CLOCK_TIME_FORMAT: 5 }, CATALOGUE, 'gridlock', 'settings');

    expect(call).toThrow('0 to 4');
  });

  /** A face's own field written by its own component has a type only the face knows, so anything goes through. */
  test('lets through a key the page and the framework say nothing about', () => {
    const call = () => checkSettingTypes({ LAYOUT: '1,0,0,4,1', APPEARANCE_QUIET_TIME_ICON: 1 }, CATALOGUE, 'gridlock', 'settings');

    expect(call).not.toThrow();
  });
});
