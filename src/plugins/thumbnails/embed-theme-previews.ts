/**
 * Base64-encodes a face's theme preview pictures into the JS assets the picture pickers read, so each
 * option shows a small picture of itself beside its name.
 *
 * It embeds and does not draw. The pictures are made elsewhere, often the same screenshots a face's
 * README shows, and the face owns where they live. All this does is inline them, because the picker
 * runs in a sandboxed config webview that cannot reach local files, so the pictures have to travel
 * as data URLs.
 *
 * Input:  resources/theme-previews.json  ->  { "<theme value>": "<png path>" | ["<png>", "<png>"], ... }
 * Output: src/pkjs/clay/theme-previews.g.js  ->  module.exports = { "<theme value>": [dataUrl, ...], ... }
 *
 * A theme can carry one picture or a few (such as a day and a night shot), so a value is a path or a
 * list of paths. The output always holds a list, so the picker draws however many it is given side
 * by side.
 *
 * A value can instead be a map keyed by platform, `{ "emery": <path|list>, "gabbro": <path|list> }`,
 * so a face shows a round watch its round shots and a rectangular one its own. The picker reads the
 * watch the page was opened from and draws that platform's list. A platform name has to be one Pebble
 * knows, so a typo stops the run rather than shipping a theme that shows nothing on that watch. The
 * output mirrors the shape, a list for a flat value and a map of lists for a platform-keyed one.
 *
 * A face with more than one picture picker names a map for each other picker. The manifest's maps
 * key holds a map per name, in the same shape as the manifest's own entries, and each is written to
 * src/pkjs/clay/theme-previews-<name>.g.js. Its mapsByKey key holds a map per name for a picker whose
 * shots follow another control through previewsByKey. Each of those is keyed first by that control's
 * value and then by the picker's, and written to the same kind of file. The entries outside both keys
 * are the main map, written to theme-previews.g.js. A manifest holding only named maps writes no main
 * file.
 *
 * The keys are the option values the picker carries, as strings, since JSON keys are strings and
 * Clay sends the value as one anyway. A path is relative to the face folder, and may climb out of it
 * with .. since the whole repo is checked out when this runs. JS lists an object's integer keys
 * smallest first and any other key in insertion order, so the values a picker uses come out smallest
 * first and the asset is the same however the manifest is ordered.
 *
 * Run: paf gen <face> theme-previews, or by hand with no face for every face with a manifest. It
 * reports what it encoded and throws if a path is missing or is not a PNG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { faceDir, listFaceNames } from '../../tools/shared/faces.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import { isPng, pngDataUrl } from './data-url.ts';

/**
 * A face's theme-previews manifest.
 *
 * @param face The face.
 * @return The manifest's path, resources/theme-previews.json under the face.
 */
export function manifestFile(face: string): string {
  return path.join(faceDir(face), 'resources', 'theme-previews.json');
}

/** The folder the generated assets land in, under the face. */
function clayDir(face: string): string {
  return path.join(faceDir(face), 'src', 'pkjs', 'clay');
}

/**
 * The file name one map is written to, theme-previews.g.js for the main map and
 * theme-previews-<name>.g.js for a named one.
 *
 * @param name The map's name, or null for the main map.
 * @return The file name, with no folder.
 */
export function outName(name: string | null): string {
  return name === null ? 'theme-previews.g.js' : `theme-previews-${name}.g.js`;
}

/**
 * Where a face's generated theme-preview asset is written.
 *
 * @param face The face.
 * @param name The map's name, or null or left out for the main map.
 * @return The generated asset's path, under src/pkjs/clay/ in the face.
 */
export function outFile(face: string, name: string | null = null): string {
  return path.join(clayDir(face), outName(name));
}

/** A map's name lands in a file name and an import, so it keeps to lowercase words joined by dashes. */
const MAP_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Whether a name is one a map can carry. A name ending in component is refused as well, since its
 * file would end in -component.g.js, the name a Clay component's generated output takes, and the
 * component check would read the map as one of its own.
 */
function isMapName(name: string): boolean {
  return MAP_NAME.test(name) && name !== 'component' && !name.endsWith('-component');
}

/**
 * The generated theme-preview assets a face has on disk, by file name, whether or not its manifest
 * builds them. Only a name a map could be written to counts, so another generator's output that
 * starts theme-previews-, such as a Clay component's theme-previews-picker-component.g.js, is left
 * alone rather than reported as a map's leftover.
 *
 * @param face The face.
 * @return Each theme-previews.g.js and theme-previews-<name>.g.js file name, sorted.
 */
export function committedOutNames(face: string): string[] {
  const dir = clayDir(face);

  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => {
      if (file === outName(null)) {
        return true;
      }

      const match = file.match(/^theme-previews-(.+)\.g\.js$/);

      return match !== null && isMapName(match[1]);
    })
    .sort();
}

/** The platform names a platform-keyed value may use, the ones Pebble builds for. */
export const KNOWN_PLATFORMS = ['emery', 'gabbro', 'chalk', 'basalt', 'aplite', 'diorite', 'flint'];

/** The manifest keys that hold named maps rather than an option of the main map. */
const MAP_KEYS = ['maps', 'mapsByKey'];

/**
 * One manifest entry: the option value as its string key, and its pictures.
 *
 * A flat entry carries one list of paths for every watch. A platform-keyed one carries a list per
 * platform, in the order the manifest wrote them so the asset is stable.
 */
export type PreviewEntry =
  | { value: string; kind: 'flat'; files: string[] }
  | { value: string; kind: 'byPlatform'; platforms: Array<{ platform: string; files: string[] }> };

/**
 * One map the manifest describes, and the file it is written to.
 *
 * The main map has no name. A plain map carries its entries. A map for a picker with previewsByKey
 * carries a group of entries per value of the control it follows.
 */
export type PreviewMap =
  | { name: string | null; kind: 'plain'; entries: PreviewEntry[] }
  | { name: string; kind: 'byKey'; groups: Array<{ key: string; entries: PreviewEntry[] }> };

/** Validates one value's paths, a single path or a list of them, and hands them back as a list.
 * label says what the paths belong to, the value or a platform under it, so a bad one names the
 * right thing. */
function readPaths(picture: unknown, label: string, file: string): string[] {
  const paths = Array.isArray(picture) ? picture : [picture];

  if (!paths.length) {
    throw new ToolError(`${file}: ${label} has to name at least one picture`);
  }

  paths.forEach((one) => {
    if (typeof one !== 'string' || one.trim() === '') {
      throw new ToolError(`${file}: a path for ${label} has to be a non-empty string`);
    }

    if (path.isAbsolute(one)) {
      throw new ToolError(`${file}: a path for ${label} has to be relative to the face folder, not absolute`);
    }
  });

  return paths as string[];
}

/** Whether a parsed value is a plain JSON object, not a list or null. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Reads one map's entries, each value to a path, a list of paths, or a map of either per platform.
 * where names the map in a message, empty for the main map. */
function readEntries(map: Record<string, unknown>, keys: string[], where: string, file: string): PreviewEntry[] {
  return keys.map((value): PreviewEntry => {
    const picture = map[value];
    const label = `"${value}"${where}`;

    // a map keyed by platform: a list per watch, so each shows its own shots
    if (isObject(picture)) {
      const names = Object.keys(picture);

      if (!names.length) {
        throw new ToolError(`${file}: ${label} has to name at least one platform`);
      }

      const platforms = names.map((platform) => {
        if (KNOWN_PLATFORMS.indexOf(platform) === -1) {
          throw new ToolError(`${file}: ${label} names an unknown platform "${platform}". known: ${KNOWN_PLATFORMS.join(', ')}`);
        }

        const files = readPaths(picture[platform], `${label} platform "${platform}"`, file);

        return { platform: platform, files: files };
      });

      return { value: value, kind: 'byPlatform', platforms: platforms };
    }

    return { value: value, kind: 'flat', files: readPaths(picture, label, file) };
  });
}

/** Reads the named maps under one of the manifest's map keys, checking each name and that each map
 * holds something. byKey reads each map as a group per value of the control it follows. */
function readNamedMaps(section: unknown, key: string, byKey: boolean, file: string): PreviewMap[] {
  if (!isObject(section)) {
    throw new ToolError(`${file}: ${key} has to be an object of map name to map`);
  }

  // an empty block builds nothing and says nothing, and the check then reports every committed
  // map file as one no map builds, which reads as a broken check rather than an empty block
  if (!Object.keys(section).length) {
    throw new ToolError(`${file}: ${key} has to name at least one map, or be left out`);
  }

  return Object.keys(section).map((name): PreviewMap => {
    if (!MAP_NAME.test(name)) {
      throw new ToolError(`${file}: the map name "${name}" under ${key} has to be lowercase letters and digits, with dashes between words, since it names the file the map is written to`);
    }

    if (!isMapName(name)) {
      throw new ToolError(`${file}: the map name "${name}" under ${key} ends in component, so its file would end in -component.g.js, the name a Clay component's output takes. Give it another name`);
    }

    const map = section[name];

    if (!isObject(map) || !Object.keys(map).length) {
      throw new ToolError(`${file}: the map "${name}" under ${key} has to be an object naming at least one value`);
    }

    if (!byKey) {
      return { name: name, kind: 'plain', entries: readEntries(map, Object.keys(map), ` in map "${name}"`, file) };
    }

    const groups = Object.keys(map).map((group) => {
      const inner = map[group];

      if (!isObject(inner) || !Object.keys(inner).length) {
        throw new ToolError(`${file}: "${group}" in map "${name}" has to be an object of option value to pictures, since ${key} maps are keyed first by the other control's value`);
      }

      return { key: group, entries: readEntries(inner, Object.keys(inner), ` under "${group}" in map "${name}"`, file) };
    });

    return { name: name, kind: 'byKey', groups: groups };
  });
}

/**
 * Reads and validates the manifest text into the maps it describes, keeping the keys in the order JS
 * lists them, smallest integer first.
 *
 * The manifest parses as an object of option value to a path, a list of paths, or a map of a path or
 * list per platform. Those entries are the main map. Its maps and mapsByKey keys hold named maps of
 * the same entries, the second keyed first by another control's value. A value that is not any of
 * those shapes, a path that is absolute, a platform name Pebble does not build for, a map name that
 * cannot be a file name, or one name used twice is the author's mistake and stops the run naming the
 * key. A single path is normalised to a one-item list. Whether a file is there is left to
 * encodePreviews, since that is a separate thing from whether the manifest is well formed.
 *
 * A manifest with no maps or mapsByKey is the main map alone, written even when it is empty. One with
 * named maps carries a main map only when it has entries outside them, so a face whose every picker
 * has a named map gets no empty main file.
 *
 * @param text The manifest's contents.
 * @param file The manifest's path, for the error message.
 * @return The main map first when there is one, then the plain maps, then the maps by key, each in manifest order.
 */
export function readManifest(text: string, file: string): PreviewMap[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ToolError(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isObject(parsed)) {
    throw new ToolError(`${file} has to be a JSON object of option value to a picture path, a list of them, or a map per platform`);
  }

  const mainKeys = Object.keys(parsed).filter((key) => MAP_KEYS.indexOf(key) === -1);
  const named = 'maps' in parsed || 'mapsByKey' in parsed;
  const maps: PreviewMap[] = [];

  if (!named || mainKeys.length) {
    maps.push({ name: null, kind: 'plain', entries: readEntries(parsed, mainKeys, '', file) });
  }

  if ('maps' in parsed) {
    maps.push(...readNamedMaps(parsed.maps, 'maps', false, file));
  }

  if ('mapsByKey' in parsed) {
    maps.push(...readNamedMaps(parsed.mapsByKey, 'mapsByKey', true, file));
  }

  const seen = new Set<string>();

  maps.forEach((map) => {
    if (map.name === null) {
      return;
    }

    if (seen.has(map.name)) {
      throw new ToolError(`${file}: the map "${map.name}" is under both maps and mapsByKey, and both would be written to ${outName(map.name)}`);
    }

    seen.add(map.name);
  });

  return maps;
}

/**
 * One encoded value, ready to write. A flat one holds a list of data URLs. A platform-keyed one
 * holds a list per platform, in the manifest's order.
 */
export type EncodedPreview =
  | { value: string; dataUrls: string[] }
  | { value: string; byPlatform: Array<{ platform: string; dataUrls: string[] }> };

/** One encoded group of a map for a picker with previewsByKey: the other control's value and its previews. */
export interface EncodedGroup {
  key: string;
  previews: EncodedPreview[];
}

/** Renders a list of data URLs as a JS array literal. */
function urlList(dataUrls: string[]): string {
  return '[' + dataUrls.map((url) => JSON.stringify(url)).join(', ') + ']';
}

/** Renders one value's pictures as the right-hand side of its row. */
function pictures(preview: EncodedPreview): string {
  if ('byPlatform' in preview) {
    return '{ ' + preview.byPlatform.map((one) => JSON.stringify(one.platform) + ': ' + urlList(one.dataUrls)).join(', ') + ' }';
  }

  return urlList(preview.dataUrls);
}

/** The lines every generated asset opens with. */
const BANNER = [
  '// generated by the thumbnails plugin',
  '// do not edit by hand: run `paf gen <face> theme-previews` after changing the pictures',
  'module.exports = {',
];

/**
 * Renders a plain map's asset source, rows in the order given so the file is stable across runs.
 *
 * @param previews Each value and its encoded data URLs, smallest key first.
 * @return The generated asset's full source text.
 */
export function buildSource(previews: EncodedPreview[]): string {
  const lines = [...BANNER];

  previews.forEach((preview) => {
    lines.push('  ' + JSON.stringify(preview.value) + ': ' + pictures(preview) + ',');
  });
  lines.push('};', '');
  return lines.join('\n');
}

/**
 * Renders the asset source of a map for a picker with previewsByKey, a block per value of the control
 * it follows, rows in the order given so the file is stable across runs.
 *
 * @param groups Each value of the other control and its previews, smallest key first.
 * @return The generated asset's full source text.
 */
export function buildKeyedSource(groups: EncodedGroup[]): string {
  const lines = [...BANNER];

  groups.forEach((group) => {
    lines.push('  ' + JSON.stringify(group.key) + ': {');
    group.previews.forEach((preview) => {
      lines.push('    ' + JSON.stringify(preview.value) + ': ' + pictures(preview) + ',');
    });
    lines.push('  },');
  });
  lines.push('};', '');
  return lines.join('\n');
}

/** One asset a run would write: the map's name, null for the main map, its source, and how many values it encoded. */
export interface BuiltFile {
  name: string | null;
  source: string;
  count: number;
}

/** What one run would produce: every asset, and any paths it could not use. */
export interface BuiltPreviews {
  files: BuiltFile[];
  problems: string[];
}

/**
 * Reads the manifest and encodes each picture inline, without touching the output.
 *
 * Split from build so check-theme-previews.ts can ask what the generator would write and compare it
 * to the committed copies. A path that is missing or is not a PNG becomes a problem line rather than
 * a throw, so the check can report every face's trouble in one pass. Each source is built from the
 * pictures that did encode, smallest key first.
 *
 * @param face The face to read the manifest and pictures for.
 * @return What this run would produce, an encoded source per map plus any paths it could not use.
 */
export function encodePreviews(face: string): BuiltPreviews {
  const file = manifestFile(face);
  const maps = readManifest(fs.readFileSync(file, 'utf8'), file);
  const dir = faceDir(face);
  const problems: string[] = [];

  /** Encodes one value's paths, noting any it cannot use as a problem line, and hands back the data
   * URLs and whether every path encoded. */
  function encodeFiles(label: string, files: string[]): { dataUrls: string[]; ok: boolean } {
    const urls: string[] = [];
    let ok = true;

    files.forEach((one) => {
      const picture = path.resolve(dir, one);

      if (!fs.existsSync(picture)) {
        problems.push(`${label}: ${one} is missing`);
        ok = false;
        return;
      }

      if (!isPng(picture)) {
        problems.push(`${label}: ${one} is not a PNG`);
        ok = false;
        return;
      }

      urls.push(pngDataUrl(picture));
    });

    return { dataUrls: urls, ok: ok };
  }

  /** Encodes one map's entries. A value goes in whole or not at all, so one with a good and a bad
   * picture is held back rather than shipping half its row. The bad path is already a problem line. */
  function encodeEntries(entries: PreviewEntry[], where: string): EncodedPreview[] {
    const encoded: EncodedPreview[] = [];

    entries.forEach((entry) => {
      const label = `"${entry.value}"${where}`;

      if (entry.kind === 'flat') {
        const built = encodeFiles(label, entry.files);

        if (built.ok) {
          encoded.push({ value: entry.value, dataUrls: built.dataUrls });
        }

        return;
      }

      const byPlatform = entry.platforms.map((one) => ({ platform: one.platform, built: encodeFiles(label, one.files) }));

      if (byPlatform.every((one) => one.built.ok)) {
        encoded.push({ value: entry.value, byPlatform: byPlatform.map((one) => ({ platform: one.platform, dataUrls: one.built.dataUrls })) });
      }
    });

    return encoded;
  }

  const files = maps.map((map): BuiltFile => {
    if (map.kind === 'plain') {
      const previews = encodeEntries(map.entries, map.name === null ? '' : ` in map "${map.name}"`);

      return { name: map.name, source: buildSource(previews), count: previews.length };
    }

    const groups = map.groups.map((group) => ({ key: group.key, previews: encodeEntries(group.entries, ` under "${group.key}" in map "${map.name}"`) }));
    const count = groups.reduce((total, group) => total + group.previews.length, 0);

    return { name: map.name, source: buildKeyedSource(groups), count: count };
  });

  return { files: files, problems: problems };
}

/**
 * Writes every asset, once the run is known good. Throws rather than ship a half-right one.
 *
 * @param face The face to build the theme-preview assets for.
 */
export function build(face: string): void {
  if (!fs.existsSync(manifestFile(face))) {
    throw new ToolError(`${face} has no resources/theme-previews.json to embed`);
  }

  const built = encodePreviews(face);

  // check before writing. writing first would clobber the good committed assets with broken ones on
  // the way to throwing, and nothing would force a checkout
  if (built.problems.length) {
    const lines = built.problems.map((problem) => `  ${problem}`);

    throw new ToolError(`${face}: picture the face cannot use (${built.problems.length}):\n${lines.join('\n')}`);
  }

  built.files.forEach((one) => {
    const out = outFile(face, one.name);

    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, one.source);

    const bytes = fs.statSync(out).size;

    console.log('wrote ' + out + ' (' + Math.round(bytes / 1024) + ' KB), ' + one.count + ' previews');
  });

  // a map renamed or taken out leaves its old asset behind. the face may still import it, so it is
  // named here for the face to delete rather than deleted under it
  const written = built.files.map((one) => outName(one.name));

  committedOutNames(face)
    .filter((name) => written.indexOf(name) === -1)
    .forEach((name) => console.warn(`warning: ${path.join(clayDir(face), name)} is built by no map in the manifest, so delete it`));
}

if (isMainScript(import.meta)) {
  try {
    const face = process.argv[2];
    // no face means every face that ships a manifest
    const faces = face ? [face] : listFaceNames().filter((name) => fs.existsSync(manifestFile(name)));

    faces.forEach((name) => build(name));
  } catch (error) {
    reportFailure(error);
  }
}
