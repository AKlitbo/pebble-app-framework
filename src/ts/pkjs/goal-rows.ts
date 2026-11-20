/**
 * The settings rows for daily movement goals and the buzz when one is met.
 *
 * Each row is its own piece, so a face can lay them out with its own rows in between, and
 * `goalRows` puts them in their usual order for a face that has nothing to add. The goal selects send
 * a menu index rather than the number. The watch keeps the numbers in `health/goals.h`, and a spec
 * checks the two lists hold the same goals in the same order. The keys are the ones the watch's
 * `KNOWN_GOAL_*` entries and `KNOWN_DISTANCE_UNIT` read.
 */

import type { ClayConfigItem, ClayOption } from '../clay/types';
import { select, subheading } from './config-rows';

/** The step goals, in menu order. */
export const GOAL_STEPS: readonly number[] = [5000, 7500, 10000, 12500, 15000, 20000, 25000];

/** The active calorie goals, in kilocalories, in menu order. */
export const GOAL_CALORIES: readonly number[] = [500, 1000, 1500, 2000, 2500, 3000];

/** The sleep goals, in hours, in menu order. */
export const GOAL_SLEEP_HOURS: readonly number[] = [6, 7, 8, 9, 10];

/** The active minute goals, in menu order. */
export const GOAL_ACTIVE_MINUTES: readonly number[] = [15, 30, 45, 60, 90];

/** The heart rate limits, in beats per minute, in menu order. */
export const GOAL_HR_LIMITS: readonly number[] = [150, 160, 170, 180, 190, 200];

/**
 * The distance goals, in menu order. The watch keeps them in kilometres whatever unit the wearer
 * reads distance in, so the miles in each label are only there to read by.
 */
export const GOAL_DISTANCES: ReadonlyArray<{ km: number; label: string }> = [
  { km: 2, label: '2 km (1.2 mi)' },
  { km: 3, label: '3 km (1.9 mi)' },
  { km: 5, label: '5 km (3.1 mi)' },
  { km: 8, label: '8 km (5 mi)' },
  { km: 10, label: '10 km (6.2 mi)' },
  { km: 15, label: '15 km (9.3 mi)' },
  { km: 20, label: '20 km (12.4 mi)' },
];

/**
 * The Goal Met Vibration picks every face offers, the watch's own pulses. The value is what the watch
 * plays: None is empty text, and a letter is a plain pulse, S, L, or D. A face adds its own picks after
 * these with `vibePicks`, and Custom with `custom`.
 */
export const GOAL_VIBE_OPTIONS: readonly ClayOption[] = [
  { label: 'None', value: '' },
  { label: 'Short', value: 'S' },
  { label: 'Long', value: 'L' },
  { label: 'Double', value: 'D' },
];

/** The Custom pick, which plays the Custom Vibration Pattern box. */
export const GOAL_VIBE_CUSTOM_OPTION: ClayOption = { label: 'Custom', value: 'C' };

/** The most characters the Custom Vibration Pattern box takes. The watch keeps 122 bytes, so this and the end of the text fit. */
export const GOAL_VIBE_CUSTOM_MAX_LENGTH = 120;

/** What a face can change about the Heart Rate Limit row. */
export type HeartRateLimitOptions = {
  /** The help line under the row. Left out, the row has none. */
  description?: string;
  /** Clay's own item filter, such as `['NOT_PLATFORM_GABBRO']` to leave the row off a watch with no heart rate sensor. */
  capabilities?: string[];
};

/** What a face can change about the Distance Unit row. */
export type DistanceUnitOptions = {
  /** The help line under the row. Left out, the row has none. */
  description?: string;
};

/** What a face can change about the Goal Alerts rows. */
export type GoalAlertOptions = {
  /** The help line under the Goal Met Vibration select. Left out, it says the watch buzzes the first time each day a goal is met. */
  description?: string;
  /**
   * The face's own picks, offered after Double. Each value is a comma list of milliseconds such as
   * `'100,80,300'`, starting on a buzz, which the watch plays straight through. The build stops on a
   * value longer than the 63 characters the watch keeps, or one that is not a list of up to 40 whole
   * milliseconds from 10 to 10000 with no spaces.
   */
  vibePicks?: ClayOption[];
  /**
   * Adds the Custom pick last and the Custom Vibration Pattern box under the select, on
   * `HEALTH_GOAL_VIBE_CUSTOM`. Left out, neither is on the page, and the face needs neither the key nor
   * `KNOWN_GOAL_VIBE_CUSTOM`.
   */
  custom?: boolean;
};

/** What `goalRows` lays out. */
export type GoalRowsOptions = {
  /** Adds the Heart subheading and the Heart Rate Limit row. Left out, neither is on the page. */
  heartRate?: HeartRateLimitOptions;
  /** The Distance Unit row, on by default. false leaves it off, for a face that keeps no `HEALTH_DISTANCE_UNIT`. */
  distanceUnit?: DistanceUnitOptions | false;
  /** The Goal Alerts rows, on by default. false leaves them off, for a face that shows goals and never buzzes. */
  alerts?: GoalAlertOptions | false;
};

/** The Goal Met Vibration help line for a face that gives none of its own. */
const GOAL_VIBE_DESCRIPTION = 'The watch buzzes the first time each day you reach a goal.';

/** A menu of numbers, each labelled the way the page shows it, valued by its index. */
function numbered(values: readonly number[], label: (value: number) => string): ClayOption[] {
  return values.map((value, index) => ({ label: label(value), value: index }));
}

/**
 * The Activity subheading, which opens the movement goals.
 *
 * @return The row.
 */
export function activityHeading(): ClayConfigItem {
  return subheading('Activity');
}

/**
 * The Step Goal select, on `HEALTH_GOAL_STEPS`. It opens on 10,000.
 *
 * Each label is written in the phone's own number format, so it reads 10,000 or 10 000 as the wearer
 * expects.
 *
 * @return The row.
 */
export function stepGoalRow(): ClayConfigItem {
  return select('HEALTH_GOAL_STEPS', 'Step Goal', numbered(GOAL_STEPS, (steps) => steps.toLocaleString()), 2);
}

/**
 * The Distance Goal select, on `HEALTH_GOAL_DISTANCE`. It opens on 5 km.
 *
 * @return The row.
 */
export function distanceGoalRow(): ClayConfigItem {
  return select('HEALTH_GOAL_DISTANCE', 'Distance Goal', GOAL_DISTANCES.map((goal, index) => ({ label: goal.label, value: index })), 2);
}

/**
 * The Distance Unit select, on `HEALTH_DISTANCE_UNIT`, with kilometres as 0 and miles as 1. It opens
 * on kilometres.
 *
 * @param options The row's help line.
 * @return The row.
 */
export function distanceUnitRow(options: DistanceUnitOptions = {}): ClayConfigItem {
  return select('HEALTH_DISTANCE_UNIT', 'Distance Unit', [
    { label: 'Kilometres', value: 0 },
    { label: 'Miles', value: 1 },
  ], 0, options.description);
}

/**
 * The Calorie Goal select, on `HEALTH_GOAL_CALORIES`. It opens on 2000 kcal.
 *
 * @return The row.
 */
export function calorieGoalRow(): ClayConfigItem {
  return select('HEALTH_GOAL_CALORIES', 'Calorie Goal', numbered(GOAL_CALORIES, (kcal) => kcal + ' kcal'), 3);
}

/**
 * The Activity Goal select, on `HEALTH_GOAL_ACTIVE`, in active minutes. It opens on 30 min.
 *
 * @return The row.
 */
export function activityGoalRow(): ClayConfigItem {
  return select('HEALTH_GOAL_ACTIVE', 'Activity Goal', numbered(GOAL_ACTIVE_MINUTES, (minutes) => minutes + ' min'), 1);
}

/**
 * The Sleep subheading.
 *
 * @return The row.
 */
export function sleepHeading(): ClayConfigItem {
  return subheading('Sleep');
}

/**
 * The Sleep Goal select, on `HEALTH_GOAL_SLEEP`. It opens on 8 h.
 *
 * @return The row.
 */
export function sleepGoalRow(): ClayConfigItem {
  return select('HEALTH_GOAL_SLEEP', 'Sleep Goal', numbered(GOAL_SLEEP_HOURS, (hours) => hours + ' h'), 2);
}

/**
 * The Heart subheading.
 *
 * @param capabilities Clay's own item filter, the same one the Heart Rate Limit row takes, so the
 * heading goes with the row on a watch that leaves it off.
 * @return The row.
 */
export function heartHeading(capabilities?: string[]): ClayConfigItem {
  return withCapabilities(subheading('Heart'), capabilities);
}

/**
 * The Heart Rate Limit select, on `HEALTH_GOAL_HR`, the top of a heart rate bar. It opens on 180 bpm.
 *
 * @param options The row's help line, and Clay's filter for a watch that leaves it off.
 * @return The row.
 */
export function heartRateLimitRow(options: HeartRateLimitOptions = {}): ClayConfigItem {
  const row = select('HEALTH_GOAL_HR', 'Heart Rate Limit', numbered(GOAL_HR_LIMITS, (bpm) => bpm + ' bpm'), 3, options.description);

  return withCapabilities(row, options.capabilities);
}

/**
 * The Goal Alerts subheading and the Goal Met Vibration select on `HEALTH_GOAL_VIBE`, which opens on
 * None. With `custom` the select ends on Custom, and the Custom Vibration Pattern box on
 * `HEALTH_GOAL_VIBE_CUSTOM` follows it, showing only while Custom is picked.
 *
 * @param options The select's help line, the face's own picks, and whether to offer Custom.
 * @return The rows, in that order.
 */
export function goalAlertRows(options: GoalAlertOptions = {}): ClayConfigItem[] {
  const picks = [...GOAL_VIBE_OPTIONS, ...(options.vibePicks || []), ...(options.custom ? [GOAL_VIBE_CUSTOM_OPTION] : [])];
  const rows = [subheading('Goal Alerts'), select('HEALTH_GOAL_VIBE', 'Goal Met Vibration', picks, '', options.description ?? GOAL_VIBE_DESCRIPTION)];

  if (!options.custom) {
    return rows;
  }

  return [
    ...rows,
    {
      type: 'input',
      messageKey: 'HEALTH_GOAL_VIBE_CUSTOM',
      label: 'Custom Vibration Pattern',
      description: 'On and off times in milliseconds, separated by commas, starting with a buzz.',
      attributes: {
        placeholder: '100,80,100,80,300',
        maxlength: GOAL_VIBE_CUSTOM_MAX_LENGTH,
      },
      visibleWhen: { key: 'HEALTH_GOAL_VIBE', in: ['C'] },
    },
  ];
}

/**
 * Every goal row in its usual order: the Activity goals with the Distance Unit beside the Distance
 * Goal, the Sleep goal, the Heart Rate Limit when asked for, and the Goal Alerts. The Distance Unit
 * and the Goal Alerts are on unless the face turns them off.
 *
 * @param options Whether to add the Heart Rate Limit, the Distance Unit, and the Goal Alerts, and how.
 * @return The rows, ready to drop into a section under its heading.
 */
export function goalRows(options: GoalRowsOptions = {}): ClayConfigItem[] {
  const heart = options.heartRate ? [heartHeading(options.heartRate.capabilities), heartRateLimitRow(options.heartRate)] : [];
  const unit = options.distanceUnit === false ? [] : [distanceUnitRow(options.distanceUnit)];
  const alerts = options.alerts === false ? [] : goalAlertRows(options.alerts);

  return [
    activityHeading(),
    stepGoalRow(),
    distanceGoalRow(),
    ...unit,
    calorieGoalRow(),
    activityGoalRow(),
    sleepHeading(),
    sleepGoalRow(),
    ...heart,
    ...alerts,
  ];
}

/** The row with Clay's filter on it, or the row as it was when there is none. */
function withCapabilities(row: ClayConfigItem, capabilities?: string[]): ClayConfigItem {
  return capabilities ? { ...row, capabilities: capabilities } : row;
}

export default {
  GOAL_STEPS,
  GOAL_CALORIES,
  GOAL_SLEEP_HOURS,
  GOAL_ACTIVE_MINUTES,
  GOAL_HR_LIMITS,
  GOAL_DISTANCES,
  GOAL_VIBE_OPTIONS,
  GOAL_VIBE_CUSTOM_OPTION,
  GOAL_VIBE_CUSTOM_MAX_LENGTH,
  activityHeading,
  stepGoalRow,
  distanceGoalRow,
  distanceUnitRow,
  calorieGoalRow,
  activityGoalRow,
  sleepHeading,
  sleepGoalRow,
  heartHeading,
  heartRateLimitRow,
  goalAlertRows,
  goalRows,
};
