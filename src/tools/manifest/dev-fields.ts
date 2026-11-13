/**
 * The small readers every block of a unit's paf.dev.config.json shares, so the seeds, the walks, and
 * the switches word a refusal the same way and read a clock the same way.
 */
import { ToolError } from '../shared/tool-error.ts';

/** Where a message points, such as `mosaic/paf.dev.config.json` and `gridlock's `, empty for the top of the file. */
export type Where = { file: string; owner: string };

/** A 24-hour `HH:MM`, with the hour and the minute caught. */
const CLOCK_TEXT = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * The start of a refusal for one field.
 *
 * @param where Where the field sits.
 * @param field The field, such as `stores.weather.temp`.
 * @param value What the file holds there.
 * @return The opening, such as `mosaic/paf.dev.config.json sets gridlock's stores.weather.temp to 900`.
 */
export function sets(where: Where, field: string, value: unknown): string {
  return `${where.file} sets ${where.owner}${field} to ${JSON.stringify(value)}`;
}

/**
 * Refuses any field a block holds that it does not take, naming the ones it does, since a misspelt
 * field would otherwise be left out with nothing to say.
 *
 * @param block The block.
 * @param known The fields it takes.
 * @param where Where the block sits.
 * @param field The block's own name, such as `stores.phone`.
 * @param what What takes the block, as the refusal names it, such as `the phone seed`.
 */
export function onlyKnown(block: Record<string, unknown>, known: readonly string[], where: Where, field: string, what: string): void {
  const unknown = Object.keys(block).filter((key) => !known.includes(key));

  if (unknown.length > 0) {
    throw new ToolError(`${where.file} sets ${where.owner}${field}.${unknown.join(', ')}, which ${what} does not take. It takes ${known.join(', ')}`);
  }
}

/**
 * A 24-hour `HH:MM` as minutes past midnight.
 *
 * @param value The time as the file holds it.
 * @return Minutes past midnight, 0 to 1439, or null when the value is not a 24-hour `HH:MM`.
 */
export function clockMinutes(value: unknown): number | null {
  const time = typeof value === 'string' ? CLOCK_TEXT.exec(value) : null;

  return time ? Number(time[1]) * 60 + Number(time[2]) : null;
}
