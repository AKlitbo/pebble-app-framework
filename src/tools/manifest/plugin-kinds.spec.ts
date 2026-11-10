/**
 * Specs for the table of plugin kinds.
 *
 * The table decides which plugin code a face carries and which keys the build asks for with each
 * define. Worth pinning are the reading of a define at 0, which has to match the C side, and that
 * the weather keys cover what the weather feature needs, since the tools cannot import that list.
 * build-pkjs.spec.ts holds the table to the real plugin-sources/index.ts.
 */
import { describe, test, expect } from 'vitest';
import { PLUGIN_KINDS, pluginKindsOn } from './plugin-kinds';
import { WEATHER_MESSAGE_KEYS } from '../../ts/weather/feature';

describe('pluginKindsOn', () => {
  /** The C side reads a define at 0 as off, so the phone build reading it as on would ship plugin code the watch side never expects. */
  test('reads a plugin define set to 0 as off', () => {
    const defines = { PLUGIN_WEATHER: 0, PLUGIN_CALENDAR: 1 };

    const result = pluginKindsOn(defines).map((kind) => kind.define);

    expect(result).toEqual(['PLUGIN_CALENDAR']);
  });

  /** A face with no plugin defines has to build with every kind off, or plugin code reaches a face that never asked for it. */
  test('reads a face with no plugin defines as none', () => {
    const defines = { ENGINE_SLOTS_MAX: 12 };

    const result = pluginKindsOn(defines);

    expect(result).toEqual([]);
  });
});

describe('PLUGIN_KINDS', () => {
  /**
   * The tools run under node, which cannot load the phone code's extensionless imports, so the list
   * is written out twice. A key added to the feature and not here would let a face build that never
   * shows plugin weather.
   */
  test('asks PLUGIN_WEATHER for every key the weather feature needs', () => {
    const weather = PLUGIN_KINDS.find((kind) => kind.define === 'PLUGIN_WEATHER');

    const result = WEATHER_MESSAGE_KEYS.filter((key) => !weather.keys.includes(key));

    expect(result).toEqual([]);
  });

  /** A plugin only face leaves its select key out, so a select key also in keys would be asked for and refused at once. */
  test('keeps every select key out of its kind\'s keys', () => {
    const result = PLUGIN_KINDS.filter((kind) => kind.selectKey && kind.keys.includes(kind.selectKey)).map((kind) => kind.define);

    expect(result).toEqual([]);
  });
});
