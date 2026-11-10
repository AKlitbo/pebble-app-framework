/**
 * Specs for the plugin phone battery mapping.
 *
 * An update from the Pebble app's Phone plugin has to reach the watch as one whole percent, or -1
 * when it holds no level. The parts worth pinning are the edges, a missing or odd reading turning
 * into no reading rather than a 0 that looks real, and a fraction or a number past either end still
 * landing on a level the watch can draw. The fixtures follow the built-in plugin's shapes.
 */

import { describe, test, expect } from 'vitest';
import { batteryFromUpdate } from './phone';
import { declaresStandard, PHONE_STANDARD } from './standard';
import type { PluginSummary, SourceEnvelope } from './types';

const PHONE_UUID = '00000000-0000-0000-0001-000000000001';

/** One update holding the phone's state, with the battery as the built-in plugin sends it. */
function update(level: unknown, extra: Record<string, unknown> = {}): SourceEnvelope {
  return {
    pluginUuid: PHONE_UUID,
    instances: [{ instanceId: 'phone', properties: { battery_level: { numericValue: { value: level as number, unit: '%' }, shortText: { text: `${level}%` } }, ...extra } }],
  };
}

describe('batteryFromUpdate', () => {
  /** The level is what the panel draws, so it has to arrive as the plugin sent it. */
  test('reads the level as a whole percent', () => {
    const result = batteryFromUpdate(update(84));

    expect(result).toBe(84);
  });

  /** A fraction would never match the last send, and the watch takes whole numbers only. */
  test('rounds a fraction to the nearest whole percent', () => {
    const result = batteryFromUpdate(update(83.6));

    expect(result).toBe(84);
  });

  /** A level past either end would draw a battery past full or below empty. */
  test.each([[140, 100], [-5, 0]])('keeps %d inside 0 to 100 as %d', (level, expected) => {
    const result = batteryFromUpdate(update(level));

    expect(result).toBe(expected);
  });

  /** The plugin sends no instance when it has no level and no network, which is no reading, not an empty battery. */
  test('reads an update with no instance as no reading', () => {
    const result = batteryFromUpdate({ pluginUuid: PHONE_UUID, instances: [] });

    expect(result).toBe(-1);
  });

  /** A state holding only the Wi-Fi says nothing about the battery, so it is no reading. */
  test('reads a state with no battery level as no reading', () => {
    const result = batteryFromUpdate({ pluginUuid: PHONE_UUID, instances: [{ instanceId: 'phone', properties: { wifi: { boolean: { value: true } } } }] });

    expect(result).toBe(-1);
  });

  /** Nothing off the phone is trusted, so text where the number goes reads as no reading rather than throwing. */
  test.each([['text', 'lots'], ['nothing', null], ['a missing update', undefined]])('reads %s as no reading', (_label, level) => {
    const envelope = level === undefined ? undefined : update(level);

    const result = batteryFromUpdate(envelope);

    expect(result).toBe(-1);
  });
});

describe('PHONE_STANDARD', () => {
  /** The Pebble app's own plugin is what nearly every wearer has, so it must never read as one the face cannot use. */
  test('passes the built-in Phone plugin', () => {
    const phone: PluginSummary = {
      uuid: PHONE_UUID,
      name: 'Phone',
      sources: [{ category: 'phone', items: ['phone_state'], properties: { battery_level: ['numericValue', 'shortText'], cell: ['shortText'], wifi: ['boolean', 'shortText'] } }],
    };

    const result = declaresStandard(phone, 'phone', 'phone_state', PHONE_STANDARD);

    expect(result).toBe(true);
  });

  /** A plugin offering the level only as text leaves the panel empty, so the page has to say why. */
  test('fails a plugin offering the level only as text', () => {
    const textOnly: PluginSummary = { uuid: 'odd', name: 'Odd', sources: [{ category: 'phone', items: ['phone_state'], properties: { battery_level: ['shortText'] } }] };

    const result = declaresStandard(textOnly, 'phone', 'phone_state', PHONE_STANDARD);

    expect(result).toBe(false);
  });
});
