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
 *
 * A mapsByKey map can list its options once under keys and previews. The name each key swaps into
 * the paths is what sends each scene to its own folder, so a slip there shows one scene another's shots.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readManifest, buildSource, buildKeyedSource, build, outFile } from './embed-theme-previews';
import { ToolError } from '../../tools/shared/tool-error';
import { openFaceWorkspace, pictureUrl, writeFace } from '../../ts/testing/preview-faces';

const requireAsset = createRequire(import.meta.url);

// the token a mapsByKey map with keys puts where each key's name goes
const KEY = '{key}';

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

describe('readManifest with keys in a mapsByKey map', () => {
  /** A short-form map with the given previews and keys, as manifest text. */
  function shortForm(previews: unknown, keys: unknown = { 0: 'ridge' }): string {
    return JSON.stringify({ mapsByKey: { 'scene-palette': { keys, previews } } });
  }

  /** Horizon lists 8 palettes once for 11 scenes, so each scene's group has to get every option with its own folder in each path. */
  test('reads a group per key with its name in every path', () => {
    const manifest = { mapsByKey: { 'scene-palette': { keys: { 1: 'shore', 0: 'ridge' }, previews: { 0: { emery: `shots/${KEY}/e.png`, gabbro: [`shots/${KEY}/g.png`] }, 1: `shots/${KEY}/mono.png` } } } };

    const result = readManifest(JSON.stringify(manifest), 'f.json');

    expect(result).toEqual([
      {
        name: 'scene-palette',
        kind: 'byKey',
        groups: [
          {
            key: '0',
            entries: [
              { value: '0', kind: 'byPlatform', platforms: [{ platform: 'emery', files: ['shots/ridge/e.png'] }, { platform: 'gabbro', files: ['shots/ridge/g.png'] }] },
              { value: '1', kind: 'flat', files: ['shots/ridge/mono.png'] },
            ],
          },
          {
            key: '1',
            entries: [
              { value: '0', kind: 'byPlatform', platforms: [{ platform: 'emery', files: ['shots/shore/e.png'] }, { platform: 'gabbro', files: ['shots/shore/g.png'] }] },
              { value: '1', kind: 'flat', files: ['shots/shore/mono.png'] },
            ],
          },
        ],
      },
    ]);
  });

  /** A key with no name has nothing to swap in, so every one of its pictures would point at the wrong folder. */
  test('refuses a key whose name is empty', () => {
    const result = () => readManifest(shortForm({ 0: `${KEY}/a.png` }, { 0: '' }), 'f.json');

    expect(result).toThrow(/key "0" in map "scene-palette" has to name a string/);
  });

  /** A name with a space at one end would be swapped into the path as it is, into a folder that is not there. */
  test('refuses a key whose name has spaces at its ends', () => {
    const result = () => readManifest(shortForm({ 0: `${KEY}/a.png` }, { 0: ' ridge ' }), 'f.json');

    expect(result).toThrow(/key "0" in map "scene-palette" has to name a string for \{key\} in its paths, not empty and with no spaces at either end/);
  });

  /** A field beside keys and previews is a slip, such as preview for previews, that would otherwise drop every picture. */
  test('refuses a field beside keys and previews', () => {
    const result = () => readManifest('{ "mapsByKey": { "scene-palette": { "keys": { "0": "ridge" }, "preview": { "0": "{key}/a.png" } } } }', 'f.json');

    expect(result).toThrow(/holds keys and previews and nothing else, not "preview"/);
  });

  /** previews with keys misspelt would otherwise read as a group per option, and the picker would find no shots under any scene. */
  test.each(['key', 'Keys'])('refuses previews beside "%s" rather than keys, saying keys is missing', (field) => {
    const result = () => readManifest(JSON.stringify({ mapsByKey: { 'scene-palette': { [field]: { 0: 'ridge' }, previews: { 0: `${KEY}/a.png` } } } }), 'f.json');

    expect(result).toThrow(/the map "scene-palette" holds previews but no keys/);
  });

  /** Keys with no options under them write an asset where no scene shows a picture. */
  test('refuses keys without previews', () => {
    const result = () => readManifest('{ "mapsByKey": { "scene-palette": { "keys": { "0": "ridge" } } } }', 'f.json');

    expect(result).toThrow(/needs previews/);
  });

  /** An empty keys block nests the options under nothing, so the picker would never draw a picture. */
  test('refuses an empty keys block', () => {
    const result = () => readManifest(shortForm({ 0: `${KEY}/a.png` }, {}), 'f.json');

    expect(result).toThrow(/keys in map "scene-palette" has to be an object naming at least one value/);
  });

  /** Paths with no token give every scene the same pictures, which is never what a map listed once means. */
  test('refuses previews whose paths never hold the token', () => {
    const result = () => readManifest(shortForm({ 0: 'shots/ridge/a.png' }), 'f.json');

    expect(result).toThrow(/no path in map "scene-palette" holds \{key\}, so every key would get the same pictures/);
  });

  /** A token spelt with a capital or spaces is read as a folder name, so every scene would look in a folder that is not there. */
  test.each(['{Key}', '{ key }'])('refuses the near miss %s', (token) => {
    const result = () => readManifest(shortForm({ 0: `${KEY}/a.png`, 1: `${token}/b.png` }), 'f.json');

    expect(result).toThrow(`holds ${token}, which is not {key}`);
  });

  /** The options get the same checks once the name is in, so a platform typo still names the key it sits under. */
  test('checks the options under each key the same way', () => {
    const result = () => readManifest(shortForm({ 0: { emry: `${KEY}/a.png` } }), 'f.json');

    expect(result).toThrow(/"0" under "0" in map "scene-palette" names an unknown platform "emry"/);
  });

  /** keys and previews under maps would read as two options of a plain map, and the message would be about platforms rather than the section. */
  test('refuses keys and previews under maps, saying they only work under mapsByKey', () => {
    const result = () => readManifest(JSON.stringify({ maps: { layout: { keys: { 0: 'ridge' }, previews: { 0: `${KEY}/a.png` } } } }), 'f.json');

    expect(result).toThrow(/the map "layout" under maps holds keys or previews, the form that lists its options once, which only works under mapsByKey/);
  });

  /** The token outside a map with keys is never swapped, so the path would point at a folder called {key}. */
  test.each([
    ['the main map', { 0: `${KEY}/a.png` }],
    ['a plain map', { maps: { layout: { 0: `${KEY}/a.png` } } }],
    ['a full mapsByKey map', { mapsByKey: { 'scene-palette': { 0: { 0: `${KEY}/a.png` } } } }],
  ])('refuses the token in %s', (_where, manifest) => {
    const result = () => readManifest(JSON.stringify(manifest), 'f.json');

    expect(result).toThrow(/\{key\} only means something in a mapsByKey map that holds keys and previews/);
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

  /** A map that lists its options once has to write the very file the same map written out in full would, so the picker reads it the same way. */
  test('writes a map with keys the same as the map written out in full', () => {
    const pictures = ['shots/ridge/a.png', 'shots/ridge/b.png', 'shots/shore/a.png', 'shots/shore/b.png'];

    writeFace('short-face', { mapsByKey: { 'scene-palette': { keys: { 0: 'ridge', 1: 'shore' }, previews: { 0: 'shots/{key}/a.png', 1: 'shots/{key}/b.png' } } } }, pictures);
    writeFace('full-face', { mapsByKey: { 'scene-palette': { 0: { 0: pictures[0], 1: pictures[1] }, 1: { 0: pictures[2], 1: pictures[3] } } } }, pictures);
    build('full-face');

    build('short-face');

    expect(fs.readFileSync(outFile('short-face', 'scene-palette'), 'utf8')).toBe(fs.readFileSync(outFile('full-face', 'scene-palette'), 'utf8'));
    expect(requireAsset(outFile('short-face', 'scene-palette'))).toEqual({ 0: { 0: [pictureUrl(0)], 1: [pictureUrl(1)] }, 1: { 0: [pictureUrl(2)], 1: [pictureUrl(3)] } });
  });

  /** A scene missing one shot has to say which scene's folder is short, so the message names the option, the key, and the path with the name in it. */
  test('names the option, the key, and the filled-in path for a missing picture under keys', () => {
    writeFace('my-face', { mapsByKey: { 'scene-palette': { keys: { 0: 'ridge', 1: 'shore' }, previews: { 0: 'shots/{key}/a.png' } } } }, ['shots/ridge/a.png']);

    const result = () => build('my-face');

    expect(result).toThrow('"0" under "1" in map "scene-palette": shots/shore/a.png is missing');
  });

  /** A missing picture in a named map has to stop the run before any file is written, or the good main asset is replaced on the way to failing. */
  test('writes nothing when a named map names a missing picture', () => {
    writeFace('my-face', { 0: 'a.png', maps: { layout: { 0: 'gone.png' } } }, ['a.png']);

    const result = () => build('my-face');

    expect(result).toThrow(/"0" in map "layout": gone\.png is missing/);
    expect(fs.existsSync(outFile('my-face'))).toBe(false);
  });
});
