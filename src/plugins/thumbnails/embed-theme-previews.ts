/**
 * Base64-encodes a face's theme preview pictures into the JS asset the theme picker reads, so each
 * theme shows a small picture of itself beside its name.
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
 * The keys are the theme values the picker's options carry, as strings, since JSON keys are strings
 * and Clay sends the value as one anyway. A path is relative to the face folder, and may climb out
 * of it with .. since the whole repo is checked out when this runs. JS lists an object's integer
 * keys smallest first and any other key in insertion order, so the theme values a picker uses come
 * out smallest first and the asset is the same however the manifest is ordered.
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

/**
 * Where the generated theme-preview asset for a face is written.
 *
 * @param face The face.
 * @return The generated asset's path, src/pkjs/clay/theme-previews.g.js under the face.
 */
export function outFile(face: string): string {
  return path.join(faceDir(face), 'src', 'pkjs', 'clay', 'theme-previews.g.js');
}

/** The platform names a platform-keyed value may use, the ones Pebble builds for. */
export const KNOWN_PLATFORMS = ['emery', 'gabbro', 'chalk', 'basalt', 'aplite', 'diorite', 'flint'];

/**
 * One manifest entry: the theme value as its string key, and its pictures.
 *
 * A flat entry carries one list of paths for every watch. A platform-keyed one carries a list per
 * platform, in the order the manifest wrote them so the asset is stable.
 */
export type PreviewEntry =
  | { value: string; kind: 'flat'; files: string[] }
  | { value: string; kind: 'byPlatform'; platforms: Array<{ platform: string; files: string[] }> };

/** Validates one theme value's paths, a single path or a list of them, and hands them back as a
 * list. label says what the paths belong to, the theme value or a platform under it, so a bad one
 * names the right thing. */
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

/**
 * Reads and validates the manifest text, keeping the keys in the order JS lists them, smallest integer first.
 *
 * It parses as an object of theme value to a path, a list of paths, or a map of a path or list per
 * platform. A value that is not any of those, a path that is absolute, or a platform name Pebble
 * does not build for is the author's mistake and stops the run naming the key. A single path is
 * normalised to a one-item list. Whether a file is there is left to encodePreviews, since that is a
 * separate thing from whether the manifest is well formed.
 *
 * @param text The manifest's contents.
 * @param file The manifest's path, for the error message.
 * @return One entry per key, its paths in order, smallest key first.
 */
export function readManifest(text: string, file: string): PreviewEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ToolError(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ToolError(`${file} has to be a JSON object of theme value to a picture path, a list of them, or a map per platform`);
  }

  return Object.keys(parsed).map((value): PreviewEntry => {
    const picture = (parsed as Record<string, unknown>)[value];

    // a map keyed by platform: a list per watch, so each shows its own shots
    if (picture !== null && typeof picture === 'object' && !Array.isArray(picture)) {
      const names = Object.keys(picture as Record<string, unknown>);

      if (!names.length) {
        throw new ToolError(`${file}: "${value}" has to name at least one platform`);
      }

      const platforms = names.map((platform) => {
        if (KNOWN_PLATFORMS.indexOf(platform) === -1) {
          throw new ToolError(`${file}: "${value}" names an unknown platform "${platform}". known: ${KNOWN_PLATFORMS.join(', ')}`);
        }

        const files = readPaths((picture as Record<string, unknown>)[platform], `"${value}" platform "${platform}"`, file);

        return { platform: platform, files: files };
      });

      return { value: value, kind: 'byPlatform', platforms: platforms };
    }

    return { value: value, kind: 'flat', files: readPaths(picture, `"${value}"`, file) };
  });
}

/** What one run would produce: the asset source, how many were encoded, and any paths it could not use. */
export interface BuiltPreviews {
  source: string;
  count: number;
  problems: string[];
}

/**
 * One encoded theme value, ready to write. A flat one holds a list of data URLs. A platform-keyed one
 * holds a list per platform, in the manifest's order.
 */
export type EncodedPreview =
  | { value: string; dataUrls: string[] }
  | { value: string; byPlatform: Array<{ platform: string; dataUrls: string[] }> };

/** Renders a list of data URLs as a JS array literal. */
function urlList(dataUrls: string[]): string {
  return '[' + dataUrls.map((url) => JSON.stringify(url)).join(', ') + ']';
}

/**
 * Renders the asset source, rows in the order given so the file is stable across runs.
 *
 * @param previews Each theme value and its encoded data URLs, smallest key first.
 * @return The generated asset's full source text.
 */
export function buildSource(previews: EncodedPreview[]): string {
  const lines = [
    '// generated by the thumbnails plugin',
    '// do not edit by hand: run `paf gen <face> theme-previews` after changing the pictures',
    'module.exports = {',
  ];

  previews.forEach((preview) => {
    if ('byPlatform' in preview) {
      const parts = preview.byPlatform.map((one) => JSON.stringify(one.platform) + ': ' + urlList(one.dataUrls));

      lines.push('  ' + JSON.stringify(preview.value) + ': { ' + parts.join(', ') + ' },');
    } else {
      lines.push('  ' + JSON.stringify(preview.value) + ': ' + urlList(preview.dataUrls) + ',');
    }
  });
  lines.push('};', '');
  return lines.join('\n');
}

/**
 * Reads the manifest and encodes each picture inline, without touching the output.
 *
 * Split from build so check-theme-previews.ts can ask what the generator would write and compare it
 * to the committed copy. A path that is missing or is not a PNG becomes a problem line rather than a
 * throw, so the check can report every face's trouble in one pass. The source is built from the
 * pictures that did encode, smallest key first.
 *
 * @param face The face to read the manifest and pictures for.
 * @return What this run would produce, encoded source plus any paths it could not use.
 */
export function encodePreviews(face: string): BuiltPreviews {
  const file = manifestFile(face);
  const entries = readManifest(fs.readFileSync(file, 'utf8'), file);
  const dir = faceDir(face);

  const encoded: EncodedPreview[] = [];
  const problems: string[] = [];

  /** Encodes one theme value's paths, noting any it cannot use as a problem line, and hands back the
   * data URLs and whether every path encoded. */
  function encodeFiles(value: string, files: string[]): { dataUrls: string[]; ok: boolean } {
    const urls: string[] = [];
    let ok = true;

    files.forEach((one) => {
      const picture = path.resolve(dir, one);

      if (!fs.existsSync(picture)) {
        problems.push(`"${value}": ${one} is missing`);
        ok = false;
        return;
      }

      if (!isPng(picture)) {
        problems.push(`"${value}": ${one} is not a PNG`);
        ok = false;
        return;
      }

      urls.push(pngDataUrl(picture));
    });

    return { dataUrls: urls, ok: ok };
  }

  entries.forEach((entry) => {
    // a theme goes in whole or not at all, so a value with one good and one bad picture is held
    // back rather than shipping half its row. the bad path is already a problem line
    if (entry.kind === 'flat') {
      const built = encodeFiles(entry.value, entry.files);

      if (built.ok) {
        encoded.push({ value: entry.value, dataUrls: built.dataUrls });
      }

      return;
    }

    const byPlatform = entry.platforms.map((one) => ({ platform: one.platform, built: encodeFiles(entry.value, one.files) }));

    if (byPlatform.every((one) => one.built.ok)) {
      encoded.push({ value: entry.value, byPlatform: byPlatform.map((one) => ({ platform: one.platform, dataUrls: one.built.dataUrls })) });
    }
  });

  return {
    source: buildSource(encoded),
    count: encoded.length,
    problems: problems,
  };
}

/**
 * Writes the asset, once the run is known good. Throws rather than ship a half-right one.
 *
 * @param face The face to build the theme-preview asset for.
 */
export function build(face: string): void {
  if (!fs.existsSync(manifestFile(face))) {
    throw new ToolError(`${face} has no resources/theme-previews.json to embed`);
  }

  const built = encodePreviews(face);

  // check before writing. writing first would clobber the good committed asset with a broken one on
  // the way to throwing, and nothing would force a checkout
  if (built.problems.length) {
    const lines = built.problems.map((problem) => `  ${problem}`);

    throw new ToolError(`${face}: picture the face cannot use (${built.problems.length}):\n${lines.join('\n')}`);
  }

  const out = outFile(face);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, built.source);

  const bytes = fs.statSync(out).size;

  console.log('wrote ' + out + ' (' + Math.round(bytes / 1024) + ' KB)');
  console.log('encoded: ' + built.count + ' previews');
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
