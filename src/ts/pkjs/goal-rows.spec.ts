/**
 * Specs for the daily goal rows.
 *
 * The goal selects send a menu index, and the watch turns it into a goal from its own tables in
 * `health/goals.c`. Both sides build on their own, so only a spec sees a goal added, dropped, or
 * moved on one side and not the other, and the wearer would then be measured against a goal they
 * never picked. The keys, labels, defaults, and help text are pinned as written, since a face that
 * moves its own goal rows onto these keeps the wearer's saved choices only while they match. The
 * Goal Met Vibration values are what the watch plays, so each has to fit the watch's buffer whole.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import type { ClayConfigItem } from '../clay/types';
import {
  GOAL_ACTIVE_MINUTES,
  GOAL_CALORIES,
  GOAL_DISTANCES,
  GOAL_HR_LIMITS,
  GOAL_SLEEP_HOURS,
  GOAL_STEPS,
  GOAL_VIBE_CUSTOM_MAX_LENGTH,
  GOAL_VIBE_OPTIONS,
  goalAlertRows,
  goalRows,
  heartHeading,
  heartRateLimitRow,
} from './goal-rows';

/** The numbers in one of the watch's goal tables, read from goals.c as text. */
function watchTable(name: string): number[] {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../../c/core/health/goals.c'), 'utf8');
  const match = new RegExp(`static const int16_t ${name}\\[\\] = \\{([^}]*)\\};`).exec(source);

  if (!match) {
    throw new Error(`goals.c has no table named ${name}`);
  }

  return match[1].split(',').map((entry) => Number(entry.trim()));
}

/** The buffer size a KNOWN_* entry keeps its text in, read from settings_catalog.h as text. */
function catalogSize(macro: string): number {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../../c/pebble/system/settings/settings_catalog.h'), 'utf8');
  const match = new RegExp(`#define ${macro}\\([^)]*\\)[^}]*SETTINGS_TEXT_FIELD\\(\\w+, \\w+, (\\d+)\\)`).exec(source);

  if (!match) {
    throw new Error(`settings_catalog.h has no ${macro} with a size`);
  }

  return Number(match[1]);
}

/** A row's key, label, default, and help text, the parts a saved setting and the page depend on. */
function shape(row: ClayConfigItem): Record<string, unknown> {
  return { type: row.type, messageKey: row.messageKey, label: row.label, defaultValue: row.defaultValue, description: row.description };
}

describe('goal tables', () => {
  /** A goal on one side and not the other would measure the wearer against a goal they never picked. */
  test.each([
    ['s_steps', GOAL_STEPS],
    ['s_calories', GOAL_CALORIES],
    ['s_sleep_h', GOAL_SLEEP_HOURS],
    ['s_active_min', GOAL_ACTIVE_MINUTES],
    ['s_hr_limits', GOAL_HR_LIMITS],
  ])('holds the same goals as the watch table %s, in its order', (name, page) => {
    const result = watchTable(name);

    expect(result).toEqual([...page]);
  });

  /** The watch keeps distance in metres, so each page goal in kilometres has to be its entry over 1000. */
  test('holds the same distances as the watch, in kilometres', () => {
    const result = watchTable('s_distance_m');

    expect(result).toEqual(GOAL_DISTANCES.map((goal) => goal.km * 1000));
  });

  /** A label naming another distance than the one the watch aims for would read wrong on every panel. */
  test('labels each distance with its own kilometres', () => {
    const result = GOAL_DISTANCES.map((goal) => goal.label.startsWith(`${goal.km} km `));

    expect(result).toEqual(GOAL_DISTANCES.map(() => true));
  });
});

describe('goal rows', () => {
  /** Each select sends the index, and the watch reads its table by it, so the values run 0 up with no gap. */
  test('values every goal option by its index', () => {
    const selects = goalRows({ heartRate: {} }).filter((row) => row.type === 'select' && row.messageKey !== 'HEALTH_GOAL_VIBE' && row.messageKey !== 'HEALTH_DISTANCE_UNIT');

    const result = selects.map((row) => (row.options || []).every((option, index) => option.value === index));

    expect(result).toEqual(selects.map(() => true));
  });

  /** These are the keys, labels, defaults, and help text a face keeps its wearers' saved goals under. */
  test('lays out the rows with their keys, labels, defaults, and help text', () => {
    const rows = goalRows({
      heartRate: { description: 'The heart rate line a face gives.' },
      distanceUnit: { description: 'The unit line a face gives.' },
      alerts: { description: 'The buzz line a face gives.', custom: true },
    });

    const result = rows.map(shape);

    expect(result).toEqual([
      { type: 'heading', messageKey: undefined, label: undefined, defaultValue: 'Activity', description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_STEPS', label: 'Step Goal', defaultValue: 2, description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_DISTANCE', label: 'Distance Goal', defaultValue: 2, description: undefined },
      { type: 'select', messageKey: 'HEALTH_DISTANCE_UNIT', label: 'Distance Unit', defaultValue: 0, description: 'The unit line a face gives.' },
      { type: 'select', messageKey: 'HEALTH_GOAL_CALORIES', label: 'Calorie Goal', defaultValue: 3, description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_ACTIVE', label: 'Activity Goal', defaultValue: 1, description: undefined },
      { type: 'heading', messageKey: undefined, label: undefined, defaultValue: 'Sleep', description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_SLEEP', label: 'Sleep Goal', defaultValue: 2, description: undefined },
      { type: 'heading', messageKey: undefined, label: undefined, defaultValue: 'Heart', description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_HR', label: 'Heart Rate Limit', defaultValue: 3, description: 'The heart rate line a face gives.' },
      { type: 'heading', messageKey: undefined, label: undefined, defaultValue: 'Goal Alerts', description: undefined },
      { type: 'select', messageKey: 'HEALTH_GOAL_VIBE', label: 'Goal Met Vibration', defaultValue: '', description: 'The buzz line a face gives.' },
      { type: 'input', messageKey: 'HEALTH_GOAL_VIBE_CUSTOM', label: 'Custom Vibration Pattern', defaultValue: undefined, description: 'On and off times in milliseconds, separated by commas, starting with a buzz.' },
    ]);
  });

  /** A label that drifted from the goal behind it would tell the wearer one goal and measure another. */
  test('labels the goals with their units', () => {
    const rows = goalRows({ heartRate: {} });
    const labels = (key: string) => (rows.find((row) => row.messageKey === key)?.options || []).map((option) => option.label);

    const result = {
      distance: labels('HEALTH_GOAL_DISTANCE'),
      calories: labels('HEALTH_GOAL_CALORIES'),
      active: labels('HEALTH_GOAL_ACTIVE'),
      sleep: labels('HEALTH_GOAL_SLEEP'),
      heart: labels('HEALTH_GOAL_HR'),
      unit: labels('HEALTH_DISTANCE_UNIT'),
    };

    expect(result).toEqual({
      distance: ['2 km (1.2 mi)', '3 km (1.9 mi)', '5 km (3.1 mi)', '8 km (5 mi)', '10 km (6.2 mi)', '15 km (9.3 mi)', '20 km (12.4 mi)'],
      calories: ['500 kcal', '1000 kcal', '1500 kcal', '2000 kcal', '2500 kcal', '3000 kcal'],
      active: ['15 min', '30 min', '45 min', '60 min', '90 min'],
      sleep: ['6 h', '7 h', '8 h', '9 h', '10 h'],
      heart: ['150 bpm', '160 bpm', '170 bpm', '180 bpm', '190 bpm', '200 bpm'],
      unit: ['Kilometres', 'Miles'],
    });
  });

  /** The step labels are written in the phone's own number format, the way the page has always shown them. */
  test('labels the step goals in the phone\'s number format', () => {
    const steps = goalRows().find((row) => row.messageKey === 'HEALTH_GOAL_STEPS');

    const result = (steps?.options || []).map((option) => option.label);

    expect(result).toEqual(GOAL_STEPS.map((count) => count.toLocaleString()));
  });

  /** A face that names no panels gets help text that names none either, so a wearer is never pointed at a panel the face lacks. */
  test('gives neutral help text when the face passes none', () => {
    const rows = goalRows();
    const description = (key: string) => rows.find((row) => row.messageKey === key)?.description;

    const result = { unit: description('HEALTH_DISTANCE_UNIT'), vibe: description('HEALTH_GOAL_VIBE') };

    expect(result).toEqual({
      unit: undefined,
      vibe: 'The watch buzzes the first time each day you reach a goal.',
    });
  });

  /** A face that keeps no distance unit or never buzzes must not offer rows whose keys it never declared. */
  test('leaves the Distance Unit and Goal Alerts out when the face turns them off', () => {
    const rows = goalRows({ distanceUnit: false, alerts: false });

    const result = rows.map((row) => row.messageKey ?? row.defaultValue);

    expect(result).toEqual(['Activity', 'HEALTH_GOAL_STEPS', 'HEALTH_GOAL_DISTANCE', 'HEALTH_GOAL_CALORIES', 'HEALTH_GOAL_ACTIVE', 'Sleep', 'HEALTH_GOAL_SLEEP']);
  });

  /** A face with no heart rate readout must not offer a limit its watch never reads. */
  test('leaves the Heart rows out unless asked for', () => {
    const rows = goalRows();

    const result = rows.map((row) => row.messageKey ?? row.defaultValue);

    expect(result).not.toContain('HEALTH_GOAL_HR');
    expect(result).not.toContain('Heart');
  });

  /** A round watch has no heart rate sensor, so the filter has to reach both the row and its heading. */
  test('puts the heart rate filter on the row and its heading', () => {
    const rows = goalRows({ heartRate: { capabilities: ['NOT_PLATFORM_GABBRO'] } });

    const result = rows.filter((row) => row.capabilities).map((row) => row.messageKey ?? row.defaultValue);

    expect(result).toEqual(['Heart', 'HEALTH_GOAL_HR']);
  });

  /** The pieces build the same rows on their own, so a face laying them out by hand gets what goalRows gives. */
  test('builds the same Heart rows from the pieces', () => {
    const options = { capabilities: ['NOT_PLATFORM_GABBRO'], description: 'The top of the heart rate bar.' };

    const result = [heartHeading(options.capabilities), heartRateLimitRow(options)];

    expect(result).toEqual(goalRows({ heartRate: options }).slice(8, 10));
  });
});

describe('goal alert rows', () => {
  /** The Custom box only means something while Custom is picked, so it shows only then. */
  test('shows the Custom box only while Custom is picked', () => {
    const custom = goalAlertRows({ custom: true }).find((row) => row.messageKey === 'HEALTH_GOAL_VIBE_CUSTOM');

    const result = custom?.visibleWhen;

    expect(result).toEqual({ key: 'HEALTH_GOAL_VIBE', in: ['C'] });
  });

  /** These values are what the watch plays, so a changed one changes a wearer's saved buzz. */
  test('offers the watch\'s own pulses as written', () => {
    const result = GOAL_VIBE_OPTIONS.map((option) => [option.label, option.value]);

    expect(result).toEqual([
      ['None', ''],
      ['Short', 'S'],
      ['Long', 'L'],
      ['Double', 'D'],
    ]);
  });

  /** A face's own fanfares go after Double and Custom stays last, so the page reads pulses, tunes, then the wearer's own. */
  test('puts the face\'s own picks after Double and Custom last', () => {
    const fanfare = { label: 'Fanfare', value: '50,50,250' };
    const vibe = goalAlertRows({ vibePicks: [fanfare], custom: true }).find((row) => row.messageKey === 'HEALTH_GOAL_VIBE');

    const result = (vibe?.options || []).map((option) => option.value);

    expect(result).toEqual(['', 'S', 'L', 'D', '50,50,250', 'C']);
  });

  /** A face that does not offer Custom keeps no custom pattern, so the page must not send one the watch never declared. */
  test('leaves Custom and its box out unless the face asks', () => {
    const rows = goalAlertRows();
    const vibe = rows.find((row) => row.messageKey === 'HEALTH_GOAL_VIBE');

    const result = { keys: rows.map((row) => row.messageKey ?? row.defaultValue), values: (vibe?.options || []).map((option) => option.value) };

    expect(result).toEqual({ keys: ['Goal Alerts', 'HEALTH_GOAL_VIBE'], values: ['', 'S', 'L', 'D'] });
  });

  /** The watch keeps the pick in a fixed buffer, and a value cut short there would play a different rhythm. */
  test('fits every pick in the watch\'s buffer with its end', () => {
    const size = catalogSize('KNOWN_GOAL_VIBE');

    const result = GOAL_VIBE_OPTIONS.filter((option) => Buffer.byteLength(String(option.value), 'utf8') + 1 > size);

    expect(size).toBe(64);
    expect(result).toEqual([]);
  });

  /** The Custom box's cap and its end have to fit the watch's buffer, or the tail of a long pattern is lost. */
  test('caps the Custom box at what the watch keeps', () => {
    const size = catalogSize('KNOWN_GOAL_VIBE_CUSTOM');
    const custom = goalAlertRows({ custom: true }).find((row) => row.messageKey === 'HEALTH_GOAL_VIBE_CUSTOM');

    const result = custom?.attributes?.maxlength;

    expect(result).toBe(GOAL_VIBE_CUSTOM_MAX_LENGTH);
    expect(GOAL_VIBE_CUSTOM_MAX_LENGTH + 1).toBeLessThanOrEqual(size);
  });
});
