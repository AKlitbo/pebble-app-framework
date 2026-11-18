/**
 * Specs for the theme-previews check.
 *
 * The build never runs the generator, so the committed assets are all a settings page ever sees.
 * The check is what catches a re-shot picture or an edited manifest that was not regenerated, and it
 * has to do that for every map a face's manifest names, not only the main one. A named map's asset
 * left behind after its map is taken out still ships with the face, so that is worth pinning too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkThemePreviews } from './check-theme-previews';
import { build, outFile } from './embed-theme-previews';
import { faceDir, openFaceWorkspace, pictureBytes, writeFace } from '../../ts/testing/preview-faces';

// the faces live in a temp folder per spec, so the check walks those and never the repo's own
vi.mock('../../tools/shared/faces.ts', () => import('../../ts/testing/preview-faces'));

/** A face with a main map, a plain named map, and a map by key, all current once built. */
const MANIFEST = { 0: 'a.png', maps: { layout: { 0: 'b.png' } }, mapsByKey: { 'scene-palette': { 1: { 0: 'c.png' } } } };

describe('checkThemePreviews', () => {
  beforeEach(() => {
    openFaceWorkspace('previews-check-');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A face whose every asset matches its manifest has to pass, or the check fails every unit with named maps. */
  test('passes a face whose every map is current', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');

    const result = await checkThemePreviews();

    expect(result).toEqual([]);
  });

  /** A re-shot picture in a named map without a fresh run ships the old shot under that picker, so its file has to read as stale. */
  test('reports a named map whose picture changed since it was built', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');
    fs.writeFileSync(path.join(faceDir('my-face'), 'b.png'), pictureBytes(9));

    const result = await checkThemePreviews();

    expect(result).toEqual(['my-face: theme-previews-layout.g.js is stale, run paf gen my-face theme-previews']);
  });

  /** A map added to the manifest and never built leaves its picker with nothing to import, so the missing file counts as stale. */
  test('reports a map by key that was never built', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');
    fs.rmSync(outFile('my-face', 'scene-palette'));

    const result = await checkThemePreviews();

    expect(result).toEqual(['my-face: theme-previews-scene-palette.g.js is stale, run paf gen my-face theme-previews']);
  });

  /** A map that lists its options once still has every key's pictures compared, so a re-shot picture for one scene reads as stale. */
  test('reports a map with keys whose picture changed under one key', async () => {
    writeFace('my-face', { mapsByKey: { 'scene-palette': { keys: { 0: 'ridge', 1: 'shore' }, previews: { 0: 'shots/{key}/a.png' } } } }, ['shots/ridge/a.png', 'shots/shore/a.png']);
    build('my-face');
    fs.writeFileSync(path.join(faceDir('my-face'), 'shots', 'shore', 'a.png'), pictureBytes(9));

    const result = await checkThemePreviews();

    expect(result).toEqual(['my-face: theme-previews-scene-palette.g.js is stale, run paf gen my-face theme-previews']);
  });

  /** A map taken out of the manifest leaves its asset shipping in the face's phone code with nothing to keep it current. */
  test('reports an asset whose map the manifest does not have', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');
    writeFace('my-face', { 0: 'a.png', mapsByKey: MANIFEST.mapsByKey }, ['a.png', 'b.png', 'c.png']);

    const result = await checkThemePreviews();

    expect(result).toEqual(['my-face: commits theme-previews-layout.g.js, but resources/theme-previews.json has no map that builds it, so delete it or put its map back']);
  });

  /** A missing picture in a named map has to say which map, since two pickers can both have an option 0. */
  test('names the map when a picture in it is missing', async () => {
    writeFace('my-face', { 0: 'a.png', maps: { layout: { 0: 'gone.png' } } }, ['a.png']);

    const result = await checkThemePreviews();

    expect(result).toEqual(['my-face: "0" in map "layout": gone.png is missing']);
  });

  /** A face that drops its manifest still ships every asset it built, so each one is named. */
  test('reports every committed asset of a face with no manifest', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');
    fs.rmSync(path.join(faceDir('my-face'), 'resources', 'theme-previews.json'));

    const result = await checkThemePreviews();

    expect(result).toEqual([
      'my-face: commits theme-previews-layout.g.js, but has no resources/theme-previews.json to build it from',
      'my-face: commits theme-previews-scene-palette.g.js, but has no resources/theme-previews.json to build it from',
      'my-face: commits theme-previews.g.js, but has no resources/theme-previews.json to build it from',
    ]);
  });

  /** A Clay component's output also starts theme-previews-, and telling the face to delete it would take the picker's own code off the page. */
  test('leaves out a Clay component output that starts theme-previews-', async () => {
    writeFace('my-face', MANIFEST, ['a.png', 'b.png', 'c.png']);
    build('my-face');
    fs.writeFileSync(path.join(path.dirname(outFile('my-face')), 'theme-previews-picker-component.g.js'), 'module.exports = {};\n');

    const result = await checkThemePreviews();

    expect(result).toEqual([]);
  });
});
