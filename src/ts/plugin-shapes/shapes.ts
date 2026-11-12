/**
 * Small readers for the shapes a Pebble app plugin sends.
 *
 * An update comes from someone else's code, so any property can be missing, sent in another shape,
 * or carry the wrong type. Each reader checks what it reads and hands back `undefined` for anything
 * it cannot use, so a mapper reads a field in one line and never throws on a bad one.
 *
 * A face reads plugins through ts/plugin-sources and a plugin app reads the Pebble app's built-ins
 * through ts/plugin-app, so the readers sit apart from both. A face built without plugin defines has
 * plugin-sources taken out of its build, and a plugin app's code cannot reach into it.
 */

import type { NumericValueShape, SeriesShape, SourceEnvelope, SourceInstance, SourceProperty } from '../plugin-sources/types';

/** A number read off a `numericValue`, with its unit when the plugin gave one. */
export interface NumericReading {
  value: number;
  unit: string | undefined;
}

// the shapes a series can carry values in, which all share its one axis
const SERIES_SHAPES = ['numericValue', 'shortText', 'longText', 'timestamp'];

// the moments a plugin can send, from 1970 to the start of 2200. a Date holds far more than this,
// but a moment outside it is bad data, and keeping well inside leaves room for the days and
// offsets a mapper adds before it builds a Date, which would throw on a value past its range
const MOMENT_MAX = 7258118400;

/** A finite number, or undefined for anything else, NaN and the infinities included. */
function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A moment as epoch seconds inside the range a plugin can send, or undefined. */
function moment(value: unknown): number | undefined {
  const seconds = finite(value);

  return seconds !== undefined && seconds >= 0 && seconds < MOMENT_MAX ? seconds : undefined;
}

/** The words of one text shape, or undefined when it is missing or blank. */
function words(shape: unknown): string | undefined {
  const content = shape && typeof shape === 'object' ? (shape as { text?: unknown }).text : undefined;

  return typeof content === 'string' && content.trim() !== '' ? content : undefined;
}

/** A number and its unit out of anything shaped like a `numericValue`. */
function reading(value: unknown, unit: unknown): NumericReading | undefined {
  const amount = finite(value);

  if (amount === undefined) {
    return undefined;
  }

  return { value: amount, unit: typeof unit === 'string' ? unit : undefined };
}

/** The values list of one shape inside a series, or undefined when it is not a list. */
function seriesValues(series: SeriesShape | undefined, shape: string): unknown[] | undefined {
  if (!series || typeof series !== 'object') {
    return undefined;
  }

  const inner = (series as Record<string, unknown>)[shape];
  const values = inner && typeof inner === 'object' ? (inner as { values?: unknown }).values : undefined;

  return Array.isArray(values) ? values : undefined;
}

/**
 * Reads a property's text, from the shape the caller prefers or else the other.
 *
 * A blank text counts as missing, so a plugin that sends an empty `longText` beside a real
 * `shortText` still gets its words read.
 *
 * @param property The property off an instance, which may be missing.
 * @param prefer Which text to read first, `'long'` or `'short'`.
 * @return The text, or undefined when neither shape has any.
 */
export function text(property: SourceProperty | undefined, prefer: 'long' | 'short'): string | undefined {
  if (!property || typeof property !== 'object') {
    return undefined;
  }

  const long = words(property.longText);
  const short = words(property.shortText);

  return prefer === 'long' ? long ?? short : short ?? long;
}

/**
 * Reads a property's `numericValue`.
 *
 * @param property The property off an instance, which may be missing.
 * @return The number and its unit, or undefined when there is no usable number.
 */
export function numeric(property: SourceProperty | undefined): NumericReading | undefined {
  if (!property || typeof property !== 'object') {
    return undefined;
  }

  const shape: NumericValueShape | undefined = property.numericValue;

  if (!shape || typeof shape !== 'object') {
    return undefined;
  }

  return reading(shape.value, shape.unit);
}

/**
 * Reads a property's `timestamp`.
 *
 * A moment before 1970 or from 2200 on counts as missing, so a mapper can build a Date from it.
 *
 * @param property The property off an instance, which may be missing.
 * @return The moment as epoch seconds, or undefined when there is no usable one.
 */
export function timestamp(property: SourceProperty | undefined): number | undefined {
  if (!property || typeof property !== 'object' || !property.timestamp || typeof property.timestamp !== 'object') {
    return undefined;
  }

  return moment(property.timestamp.value);
}

/**
 * Reads a property's `boolean`.
 *
 * @param property The property off an instance, which may be missing.
 * @return The flag, or undefined when there is no real boolean.
 */
export function flag(property: SourceProperty | undefined): boolean | undefined {
  if (!property || typeof property !== 'object' || !property.boolean || typeof property.boolean !== 'object') {
    return undefined;
  }

  const value = property.boolean.value;

  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Works out which point of a series holds a moment.
 *
 * The point is `floor((atSeconds - start) / stepSec)`. A forecast series starts at the place's own
 * midnight, so the first point is rarely now, and reading `values[0]` would show hours already gone.
 * The end is the longest values list the series carries, since its shapes share one axis. A start
 * outside the moments a plugin can send leaves the series with no axis.
 *
 * @param series The series off a property, which may be missing.
 * @param atSeconds The moment, as epoch seconds.
 * @return The point's index, or undefined before the start, past the end, or with no usable axis.
 */
export function seriesIndex(series: SeriesShape | undefined, atSeconds: number): number | undefined {
  if (!series || typeof series !== 'object') {
    return undefined;
  }

  const start = moment(series.start);
  const step = finite(series.stepSec);

  if (start === undefined || step === undefined || step <= 0 || finite(atSeconds) === undefined) {
    return undefined;
  }

  const index = Math.floor((atSeconds - start) / step);
  const lengths = SERIES_SHAPES.map((shape) => (seriesValues(series, shape) || []).length);
  const length = Math.max(0, ...lengths);

  return index >= 0 && index < length ? index : undefined;
}

/**
 * Reads one point of a series.
 *
 * A `null` point is a reading the plugin did not have, so it counts as missing like any other gap.
 *
 * @param series The series off a property, which may be missing.
 * @param shape Which shape inside the series to read.
 * @param index The point, normally from seriesIndex.
 * @return The number and its unit, the text, or the moment, by shape. Undefined for a missing point.
 */
export function seriesValue(series: SeriesShape | undefined, shape: 'numericValue', index: number | undefined): NumericReading | undefined;

export function seriesValue(series: SeriesShape | undefined, shape: 'shortText' | 'longText', index: number | undefined): string | undefined;

export function seriesValue(series: SeriesShape | undefined, shape: 'timestamp', index: number | undefined): number | undefined;

export function seriesValue(series: SeriesShape | undefined, shape: 'numericValue' | 'shortText' | 'longText' | 'timestamp', index: number | undefined): NumericReading | string | number | undefined {
  const values = seriesValues(series, shape);

  if (!values || index === undefined || !Number.isInteger(index) || index < 0 || index >= values.length) {
    return undefined;
  }

  const point = values[index];

  if (shape === 'numericValue') {
    return reading(point, series?.numericValue?.unit);
  }

  if (shape === 'timestamp') {
    return moment(point);
  }

  return typeof point === 'string' && point.trim() !== '' ? point : undefined;
}

/** The properties of one instance, by name. */
export type InstanceProperties = Record<string, SourceProperty | undefined>;

/**
 * The instances an update carries.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return Its instances, or an empty list when it has no list of them.
 */
export function instancesOf(envelope: SourceEnvelope | null | undefined): SourceInstance[] {
  return envelope && typeof envelope === 'object' && Array.isArray(envelope.instances) ? envelope.instances : [];
}

/**
 * The properties of one instance.
 *
 * @param instance One entry off an update's instance list, which may be anything.
 * @return Its properties, or null when it is not an object holding an object of them.
 */
export function propertiesOf(instance: unknown): InstanceProperties | null {
  if (!instance || typeof instance !== 'object') {
    return null;
  }

  const properties = (instance as SourceInstance).properties;

  return properties && typeof properties === 'object' ? properties : null;
}

/**
 * The properties of an update's first instance, for a kind the plugin serves as one instance, such
 * as the phone's state or the track playing.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return The first instance's properties, or null when there is none or it has none.
 */
export function firstProperties(envelope: SourceEnvelope | null | undefined): InstanceProperties | null {
  return propertiesOf(instancesOf(envelope)[0]);
}

export default { text, numeric, timestamp, flag, seriesIndex, seriesValue, instancesOf, propertiesOf, firstProperties };
