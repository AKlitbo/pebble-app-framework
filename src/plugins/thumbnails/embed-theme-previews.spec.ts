/**
 * Specs for the theme-previews generator.
 *
 * The manifest is face-owned and points at arbitrary paths, so readManifest is what turns a typo
 * into a named error rather than a broken page. It also splits the manifest into the maps it holds,
 * the main map for the theme picker and the named maps a second or third picker reads, so a slip
 * there hands one picker another's shots or writes a map to the wrong file. buildSource and
 * buildKeyedSource are what keep the committed assets stable run to run, so the staleness check
 * means something. build writes each map to its own file, and a manifest with no named maps has to
 * write theme-previews.g.js alone, byte for byte the same, or every face would need a fresh run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readManifest, buildSource, buildKeyedSource, build, outFile } from './embed-theme-previews';
import { ToolError } from '../../tools/shared/tool-error';
import { openFaceWorkspace, pictureUrl, writeFace } from '../../ts/testing/preview-faces';

const requireAsset = createRequire(import.meta.url);

// the faces live in a temp folder per spec, so build reads and writes there and never in the repo
vi.mock('../../tools/shared/faces.ts', () => import('../../ts/testing/preview-faces'));

/** The main map's entries, for the specs about the shapes one entry can take. */
function mainEntries(text: string): unknown {
  const maps = readManifest(text, 'f.json');

  return maps[0].kind === 'plain' && maps[0].name === null ? maps[0].entries : null;
}

describe('readManifest', () => {
  /** A manifest that is a list, not an object, cannot map theme values, so it stops with a message. */
  test('refuses a manifest that is not an object', () => {
    const result = () => readManifest('["a.png"]', 'theme-previews.json');

    expect(result).toThrow(ToolError);
  });

  /** A manifest with no named maps is the main map alone, so a face that names no maps builds theme-previews.g.js alone. */
  test('reads a manifest with no named maps as the main map alone', () => {
    const result = readManifest('{ "0": "a.png", "1": "b.png" }', 'f.json');

    expect(result).toEqual([
      {
        name: null,
        kind: 'plain',
        entries: [
          { value: '0', kind: 'flat', files: ['a.png'] },
          { value: '1', kind: 'flat', files: ['b.png'] },
        ],
      },
    ]);
  });

  /** An empty manifest still writes its main file, the same empty asset a face that has not taken its shots yet commits. */
  test('keeps an empty main map for an empty manifest', () => {
    const result = readManifest('{}', 'f.json');

    expect(result).toEqual([{ name: null, kind: 'plain', entries: [] }]);
  });

  /** A single path is the common case, so it comes back as a one-item list the rest of the code walks. */
  test('normalises a single path to a one-item list', () => {
    const result = mainEntries('{ "0": "a.png" }');

    expect(result).toEqual([{ value: '0', kind: 'flat', files: ['a.png'] }]);
  });

  /** A theme with a day and a night shot keeps both, in order, so the picker draws them left to right. */
  test('keeps a list of paths in order', () => {
    const result = mainEntries('{ "0": ["day.png", "night.png"] }');

    expect(result).toEqual([{ value: '0', kind: 'flat', files: ['day.png', 'night.png'] }]);
  });

  /** JS lists an object's integer keys smallest first, so the asset is stable however the manifest
   * happens to be ordered. */
  test('lists the numeric theme keys in numeric order', () => {
    const result = mainEntries('{ "2": "c.png", "0": "a.png", "10": "k.png" }') as Array<{ value: string }>;

    expect(result.map((entry) => entry.value)).toEqual(['0', '2', '10']);
  });

  /** An absolute path would not survive a fresh checkout on another machine, so it is refused. */
  test('refuses an absolute path', () => {
    const result = () => readManifest('{ "0": "/tmp/a.png" }', 'f.json');

    expect(result).toThrow(ToolError);
  });

  /** An empty value names no picture, which is a slip worth stopping on rather than a blank row. */
  test('refuses an empty path', () => {
    const result = () => readManifest('{ "0": "" }', 'f.json');

    expect(result).toThrow(ToolError);
  });

  /** A value that is neither a string nor a list of them cannot be a path, so it stops the run. */
  test('refuses a non-string path', () => {
    const result = () => readManifest('{ "0": 5 }', 'f.json');

    expect(result).toThrow(ToolError);
  });

  /** A platform-keyed value keeps a list per platform in order, so each watch draws its own shots. */
  test('keeps a platform-keyed value as a list per platform', () => {
    const result = mainEntries('{ "0": { "emery": ["e.png"], "gabbro": ["g1.png", "g2.png"] } }');

    expect(result).toEqual([
      {
        value: '0',
        kind: 'byPlatform',
        platforms: [
          { platform: 'emery', files: ['e.png'] },
          { platform: 'gabbro', files: ['g1.png', 'g2.png'] },
        ],
      },
    ]);
  });

  /** A single path under a platform normalises to a one-item list, the same as a flat value does. */
  test('normalises a single path under a platform', () => {
    const result = mainEntries('{ "0": { "emery": "e.png" } }');

    expect(result).toEqual([{ value: '0', kind: 'byPlatform', platforms: [{ platform: 'emery', files: ['e.png'] }] }]);
  });

  /** A platform name Pebble does not build for is a typo that would show nothing on that watch, so it stops the run. */
  test('refuses an unknown platform name', () => {
    const result = () => readManifest('{ "0": { "emry": "e.png" } }', 'f.json');

    expect(result).toThrow(ToolError);
  });

  /** An empty platform map names no pictures, so it stops rather than shipping a blank row. */
  test('refuses an empty platform map', () => {
    const result = () => readManifest('{ "0": {} }', 'f.json');

    expect(result).toThrow(ToolError);
  });

  /**
   * A second picker's shots kept beside the theme shots under prefixed keys made the face split the
   * one asset apart again in its config. A named map comes out as its own map, and none of its values
   * land in the main one.
   */
  test('reads a named map beside the main one, keeping each picker to its own values', () => {
    const result = readManifest('{ "0": "theme.png", "maps": { "layout": { "0": "legacy.png", "1": "wide.png" } } }', 'f.json');

    expect(result).toEqual([
      { name: null, kind: 'plain', entries: [{ value: '0', kind: 'flat', files: ['theme.png'] }] },
      {
        name: 'layout',
        kind: 'plain',
        entries: [
          { value: '0', kind: 'flat', files: ['legacy.png'] },
          { value: '1', kind: 'flat', files: ['wide.png'] },
        ],
      },
    ]);
  });

  /** A face whose every picker has a named map would otherwise commit an empty main asset nothing reads. */
  test('leaves out the main map when the manifest holds only named maps', () => {
    const result = readManifest('{ "maps": { "layout": { "0": "legacy.png" } } }', 'f.json');

    expect(result.map((map) => map.name)).toEqual(['layout']);
  });

  /** A picker whose shots follow another control reads a set per value of it, so each group keeps its own values and platforms. */
  test('reads a map under mapsByKey as a group per value of the control it follows', () => {
    const result = readManifest('{ "mapsByKey": { "scene-palette": { "1": { "0": "retro.png", "2": { "gabbro": "retro-round.png" } } } } }', 'f.json');

    expect(result).toEqual([
      {
        name: 'scene-palette',
        kind: 'byKey',
        groups: [
          {
            key: '1',
            entries: [
              { value: '0', kind: 'flat', files: ['retro.png'] },
              { value: '2', kind: 'byPlatform', platforms: [{ platform: 'gabbro', files: ['retro-round.png'] }] },
            ],
          },
        ],
      },
    ]);
  });

  /** A platform map in a named map reaches the picker the same way, so a round watch shows its own layout shots. */
  test('keeps a platform-keyed value in a named map', () => {
    const result = readManifest('{ "maps": { "layout": { "0": { "emery": "e.png", "gabbro": ["g.png"] } } } }', 'f.json');

    expect(result[0]).toEqual({
      name: 'layout',
      kind: 'plain',
      entries: [
        {
          value: '0',
          kind: 'byPlatform',
          platforms: [
            { platform: 'emery', files: ['e.png'] },
            { platform: 'gabbro', files: ['g.png'] },
          ],
        },
      ],
    });
  });

  /** A typo inside a named map has to say which map it is in, or the author hunts through every map's "0". */
  test('names the map in a refusal from inside it', () => {
    const result = () => readManifest('{ "maps": { "layout": { "0": { "emry": "e.png" } } } }', 'f.json');

    expect(result).toThrow(/"0" in map "layout" names an unknown platform "emry"/);
  });

  /** A map's name becomes a file name and an import, so a capital, an underscore, or a slash would write somewhere the face does not look. */
  test.each(['Layout', 'my_layout', '../layout', '', '-layout'])('refuses the map name "%s"', (name) => {
    const result = () => readManifest(JSON.stringify({ maps: { [name]: { 0: 'a.png' } } }), 'f.json');

    expect(result).toThrow(/has to be lowercase letters and digits/);
  });

  /** A map called picker-component writes theme-previews-picker-component.g.js, which the Clay component check takes for its own output. */
  test.each(['component', 'picker-component'])('refuses the map name "%s", which ends in component', (name) => {
    const result = () => readManifest(JSON.stringify({ maps: { [name]: { 0: 'a.png' } } }), 'f.json');

    expect(result).toThrow(/ends in component, so its file would end in -component\.g\.js/);
  });

  /** One name under both keys writes two maps to one file, and whichever lands last wins. */
  test('refuses a name under both maps and mapsByKey', () => {
    const result = () => readManifest('{ "maps": { "layout": { "0": "a.png" } }, "mapsByKey": { "layout": { "1": { "0": "b.png" } } } }', 'f.json');

    expect(result).toThrow(/"layout" is under both maps and mapsByKey/);
  });

  /** A named map with nothing in it writes an asset whose picker shows no picture for any option. */
  test('refuses an empty named map', () => {
    const result = () => readManifest('{ "maps": { "layout": {} } }', 'f.json');

    expect(result).toThrow(/the map "layout" under maps has to be an object naming at least one value/);
  });

  /** An empty maps block builds no map at all, and the check then calls every committed map file a leftover. */
  test.each(['maps', 'mapsByKey'])('refuses an empty %s block', (key) => {
    const result = () => readManifest(`{ "${key}": {} }`, 'f.json');

    expect(result).toThrow(`${key} has to name at least one map, or be left out`);
  });

  /** A plain map put under mapsByKey would read each option's path as a group, and the picker would find no shots under any value. */
  test('refuses a mapsByKey group that is not a map of its own', () => {
    const result = () => readManifest('{ "mapsByKey": { "palette": { "0": "a.png" } } }', 'f.json');

    expect(result).toThrow(/"0" in map "palette" has to be an object of option value to pictures/);
  });

  /** maps holding a list or a path rather than named maps is a slip worth stopping on, not a main entry called maps. */
  test('refuses a maps key that is not an object of maps', () => {
    const result = () => readManifest('{ "maps": ["layout.png"] }', 'f.json');

    expect(result).toThrow(/maps has to be an object of map name to map/);
  });
});

describe('buildSource', () => {
  /** An unchanged manifest has to write the same bytes, or the staleness check fails every run. */
  test('writes each value as a list of data urls in order', () => {
    const result = buildSource([
      { value: '0', dataUrls: ['data:image/png;base64,AA', 'data:image/png;base64,BB'] },
      { value: '1', dataUrls: ['data:image/png;base64,CC'] },
    ]);

    expect(result).toBe(
      '// generated by the thumbnails plugin\n' +
      '// do not edit by hand: run `paf gen <face> theme-previews` after changing the pictures\n' +
      'module.exports = {\n' +
      '  "0": ["data:image/png;base64,AA", "data:image/png;base64,BB"],\n' +
      '  "1": ["data:image/png;base64,CC"],\n' +
      '};\n');
  });

  /** A platform-keyed value writes a map of lists, which is the shape the picker reads per watch. */
  test('writes a platform-keyed value as a map of lists', () => {
    const result = buildSource([
      {
        value: '0',
        byPlatform: [
          { platform: 'emery', dataUrls: ['data:image/png;base64,AA'] },
          { platform: 'gabbro', dataUrls: ['data:image/png;base64,BB', 'data:image/png;base64,CC'] },
        ],
      },
    ]);

    expect(result).toBe(
      '// generated by the thumbnails plugin\n' +
      '// do not edit by hand: run `paf gen <face> theme-previews` after changing the pictures\n' +
      'module.exports = {\n' +
      '  "0": { "emery": ["data:image/png;base64,AA"], "gabbro": ["data:image/png;base64,BB", "data:image/png;base64,CC"] },\n' +
      '};\n');
  });
});

describe('buildKeyedSource', () => {
  /** A picker with previewsByKey reads the other control's value first and its own second, so the asset has to nest in that order. */
  test('writes a block per value of the other control, each holding its own values', () => {
    const result = buildKeyedSource([
      { key: '1', previews: [{ value: '0', dataUrls: ['data:image/png;base64,AA'] }] },
      { key: '2', previews: [{ value: '0', byPlatform: [{ platform: 'emery', dataUrls: ['data:image/png;base64,BB'] }] }] },
    ]);

    expect(result).toBe(
      '// generated by the thumbnails plugin\n' +
      '// do not edit by hand: run `paf gen <face> theme-previews` after changing the pictures\n' +
      'module.exports = {\n' +
      '  "1": {\n' +
      '    "0": ["data:image/png;base64,AA"],\n' +
      '  },\n' +
      '  "2": {\n' +
      '    "0": { "emery": ["data:image/png;base64,BB"] },\n' +
      '  },\n' +
      '};\n');
  });
});

describe('build', () => {
  beforeEach(() => {
    openFaceWorkspace('previews-');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A face with no named maps has to get theme-previews.g.js and nothing else, or its committed asset goes stale on the next check. */
  test('writes only the main file for a manifest with no named maps', () => {
    writeFace('plain-face', { 0: 'shots/a.png' }, ['shots/a.png']);

    build('plain-face');

    expect(fs.readdirSync(path.dirname(outFile('plain-face')))).toEqual(['theme-previews.g.js']);
  });

  /**
   * Each named map lands in its own file that a face imports straight into the picker, so a map
   * written into another's file hands one picker the other's shots.
   */
  test('writes each named map to its own file beside the main one', () => {
    writeFace('my-face', { 0: 'a.png', maps: { layout: { 0: 'b.png' } }, mapsByKey: { 'scene-palette': { 1: { 0: 'c.png' } } } }, ['a.png', 'b.png', 'c.png']);

    build('my-face');

    expect(requireAsset(outFile('my-face'))).toEqual({ 0: [pictureUrl(0)] });
    expect(requireAsset(outFile('my-face', 'layout'))).toEqual({ 0: [pictureUrl(1)] });
    expect(requireAsset(outFile('my-face', 'scene-palette'))).toEqual({ 1: { 0: [pictureUrl(2)] } });
  });

  /** A missing picture in a named map has to stop the run before any file is written, or the good main asset is replaced on the way to failing. */
  test('writes nothing when a named map names a missing picture', () => {
    writeFace('my-face', { 0: 'a.png', maps: { layout: { 0: 'gone.png' } } }, ['a.png']);

    const result = () => build('my-face');

    expect(result).toThrow(/"0" in map "layout": gone\.png is missing/);
    expect(fs.existsSync(outFile('my-face'))).toBe(false);
  });
});
