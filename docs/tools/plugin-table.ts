/**
 * The Supported Plugins table in docs/how/plugin-sources.md, written from src/known-plugins.json.
 *
 * The file is what the settings page's supported plugins panel reads, so the table is written from it
 * rather than by hand, and the two cannot say different things. The table sits between two markers in
 * the guide, and running this writes it again. The spec beside this fails when the guide's table is not
 * the one the file gives, so an entry changed without running it is caught.
 *
 * Run via npm --prefix docs run plugin-table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** One entry as src/known-plugins.json keeps it. */
export interface TableEntry {
  name: string;
  uuid: string;
  storeId: string | null;
  storeSlug: string | null;
  serves: string[];
  maker: string;
  where?: string;
  verifiedVersion: string | null;
  verifiedOn: string | null;
  /** What it serves for a kind, beyond the standard fields. Left out, it serves the standard fields. */
  gives?: Record<string, string>;
}

/** The line before the table in the guide. */
export const TABLE_START = '<!-- known-plugins:start -->';

/** The line after the table in the guide. */
export const TABLE_END = '<!-- known-plugins:end -->';

/** The start of every store listing's address, as the panel links it. */
const STORE_ADDRESS = 'https://apps.repebble.com/';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date such as `2026-11-12` as the table writes it, `12 Nov 2026`. */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);

  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** The plugin's name, linked to its store listing when it has one, with where it runs. */
function pluginCell(entry: TableEntry): string {
  const listing = entry.storeId ? `${STORE_ADDRESS}${entry.storeSlug ? `${entry.storeSlug}_` : ''}${entry.storeId}` : '';
  const name = listing ? `[${entry.name}](${listing})` : entry.name;

  return entry.where ? `${name} (${entry.where})` : name;
}

/** When the entry was last checked, and against which version. */
function verifiedCell(entry: TableEntry): string {
  return entry.verifiedVersion && entry.verifiedOn ? `${entry.verifiedVersion}, ${dayLabel(entry.verifiedOn)}` : 'Not yet';
}

/**
 * The table for a list of entries, a row for each kind each plugin serves, grouped by kind in the
 * order the kinds first come up.
 *
 * @param entries The entries, in the file's order.
 * @return The table's markdown.
 */
export function pluginTable(entries: TableEntry[]): string {
  const kinds = entries.flatMap((entry) => entry.serves).filter((kind, index, all) => all.indexOf(kind) === index);
  const rows = kinds.flatMap((kind) => entries.filter((entry) => entry.serves.includes(kind)).map((entry) => {
    const gives = entry.gives && entry.gives[kind] ? entry.gives[kind] : 'The standard fields';

    return `| \`${kind}\` | ${pluginCell(entry)} | ${entry.maker} | ${gives} | ${verifiedCell(entry)} |`;
  }));

  return ['| Kind | Plugin | Maker | What It Serves | Last Verified |', '| :-- | :-- | :-- | :-- | :-- |', ...rows].join('\n');
}

/**
 * Where a marker sits in a guide, as the indexes of the lines that are the marker alone. A marker
 * quoted inside a sentence is not one.
 *
 * @param lines The guide's lines.
 * @param marker The marker.
 * @return The index of each line that is the marker.
 */
export function markerLines(lines: string[], marker: string): number[] {
  return lines.flatMap((line, index) => (line.replace(/\r$/, '') === marker ? [index] : []));
}

/**
 * A guide with the table between its markers written again.
 *
 * Each marker has to be a line of its own, once, with the start before the end. Anything else is a
 * guide that lost or doubled one, and writing into it would drop the table or the text around it.
 *
 * @param guide The guide's markdown.
 * @param table The table's markdown.
 * @return The guide with the new table.
 * @throws An `Error` naming the trouble when a marker is missing, repeated, or out of order.
 */
export function withTable(guide: string, table: string): string {
  const lines = guide.split('\n');
  const starts = markerLines(lines, TABLE_START);
  const ends = markerLines(lines, TABLE_END);

  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) {
    throw new Error(`the guide needs ${TABLE_START} and ${TABLE_END} once each, each on a line of its own and in that order, and has ${starts.length} and ${ends.length}`);
  }

  return [...lines.slice(0, starts[0] + 1), '', ...table.split('\n'), '', ...lines.slice(ends[0])].join('\n');
}

/** The framework repo's root, two folders up from here. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The data file the table is written from. */
export const KNOWN_PLUGINS_FILE = path.join(ROOT, 'src', 'known-plugins.json');

/** The guide the table sits in. */
export const GUIDE_FILE = path.join(ROOT, 'docs', 'how', 'plugin-sources.md');

/**
 * The guide as the data file says it should read.
 *
 * @return The guide's markdown with the table written from the file.
 */
export function currentGuide(): string {
  const entries = JSON.parse(fs.readFileSync(KNOWN_PLUGINS_FILE, 'utf8')) as TableEntry[];

  return withTable(fs.readFileSync(GUIDE_FILE, 'utf8'), pluginTable(entries));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    fs.writeFileSync(GUIDE_FILE, currentGuide());
    console.log(`wrote the Supported Plugins table into ${path.relative(ROOT, GUIDE_FILE)}`);
  } catch (error) {
    console.error(`could not write the Supported Plugins table: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
