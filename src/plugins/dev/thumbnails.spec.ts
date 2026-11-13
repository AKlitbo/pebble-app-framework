/**
 * Specs for the thumbnails tool.
 *
 * Each screenshot is matched to its panel by its place in the walk, so the order of the crops, the
 * rectangle each one cuts, and the check that the walk on the emulator came back to its start are what
 * keep a picture from landing under another panel's name. The pictures are committed, so one that draws
 * what is already there must leave the file alone, which PNG bytes alone cannot tell.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir.ts';
import { harnessFingerprint } from '../../tools/manifest/dev-header.ts';
import { readDevHarness } from '../../tools/manifest/dev-switches.ts';
import { checkBuild, cropPlan, cropShots, parseThumbnailArgs, pixelsOf, samePixels, shootSteps } from './thumbnails.ts';
import type { WalkIo } from './tap-walk.ts';

/** Where a 1x2 and a 2x2 sit on Gridlock's screen when a panel is shown on its own. */
const SIZES = {
  '1x2': { crop: { left: 4, top: 94, width: 94, height: 40 } },
  '2x2': { crop: { left: 4, top: 72, width: 94, height: 83 } },
};

/** A screen-sized PNG, black but for one rectangle of colour. */
async function screen(rect: { left: number; top: number; width: number; height: number }, colour: { r: number; g: number; b: number }): Promise<Buffer> {
  const patch = await sharp({ create: { width: rect.width, height: rect.height, channels: 4, background: { ...colour, alpha: 1 } } }).png().toBuffer();

  return sharp({ create: { width: 200, height: 228, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: patch, left: rect.left, top: rect.top }])
    .png()
    .toBuffer();
}

/** The colour of a PNG's top left pixel. */
async function corner(file: string): Promise<number[]> {
  const { data } = await sharp(file).raw().toBuffer({ resolveWithObject: true });

  return [data[0], data[1], data[2]];
}

describe('cropPlan', () => {
  /** Step n is shot n, so an order out of step with the walk would name every picture after the wrong panel. */
  test('cuts each step out of its own shot at its size\'s place', () => {
    const steps = [
      { panel: 'phone-battery', size: '1x2', panelId: '75', sizeId: '0' },
      { panel: 'phone-battery', size: '2x2', panelId: '75', sizeId: '1' },
    ];

    const result = cropPlan(steps, SIZES);

    expect(result).toEqual([
      { shot: 'shot_000.png', rect: { left: 4, top: 94, width: 94, height: 40 }, file: 'phone-battery-1x2.png' },
      { shot: 'shot_001.png', rect: { left: 4, top: 72, width: 94, height: 83 }, file: 'phone-battery-2x2.png' },
    ]);
  });
});

describe('cropShots', () => {
  /** The crop has to cut the panel's own rectangle, or the picture shows the screen around it. */
  test('cuts the panel out of its shot', async () => {
    const shots = tempDir('thumbnail-shots-');
    const out = tempDir('thumbnail-out-');

    fs.writeFileSync(path.join(shots, 'shot_000.png'), await screen(SIZES['1x2'].crop, { r: 0, g: 255, b: 0 }));

    const result = await cropShots(cropPlan([{ panel: 'steps', size: '1x2', panelId: '6', sizeId: '0' }], SIZES), shots, out);

    expect(result).toEqual([{ file: 'steps-1x2.png', status: 'new' }]);
    expect(await corner(path.join(out, 'steps-1x2.png'))).toEqual([0, 255, 0]);
  });

  /** A re-shoot that draws the committed picture, packed into other bytes, must not show as a change in git. */
  test('leaves a picture with the same pixels alone', async () => {
    const shots = tempDir('thumbnail-shots-');
    const out = tempDir('thumbnail-out-');
    const crops = cropPlan([{ panel: 'steps', size: '1x2', panelId: '6', sizeId: '0' }], SIZES);

    fs.writeFileSync(path.join(shots, 'shot_000.png'), await screen(SIZES['1x2'].crop, { r: 0, g: 255, b: 0 }));
    const committed = await sharp({ create: { width: 94, height: 40, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png({ compressionLevel: 0 }).toBuffer();

    fs.writeFileSync(path.join(out, 'steps-1x2.png'), committed);

    const result = await cropShots(crops, shots, out);

    expect(result).toEqual([{ file: 'steps-1x2.png', status: 'unchanged' }]);
    expect(fs.readFileSync(path.join(out, 'steps-1x2.png')).equals(committed)).toBe(true);
  });

  /** A crop past the edge would come out short or stop sharp with a message about an extract area. */
  test('refuses a crop that runs past its shot', async () => {
    const shots = tempDir('thumbnail-shots-');

    fs.writeFileSync(path.join(shots, 'shot_000.png'), await screen(SIZES['1x2'].crop, { r: 0, g: 255, b: 0 }));
    const crops = [{ shot: 'shot_000.png', rect: { left: 150, top: 94, width: 94, height: 40 }, file: 'steps-1x2.png' }];

    const call = cropShots(crops, shots, tempDir('thumbnail-out-'));

    await expect(call).rejects.toThrow('the crop for steps-1x2.png runs past the 200 by 228 screenshot');
  });

  /** A walk cut short leaves its last steps with no shot, and their pictures would quietly stay as they were. */
  test('refuses a step with no shot', async () => {
    const crops = cropPlan([{ panel: 'steps', size: '1x2', panelId: '6', sizeId: '0' }], SIZES);

    const call = cropShots(crops, tempDir('thumbnail-shots-'), tempDir('thumbnail-out-'));

    await expect(call).rejects.toThrow('the walk has a step for steps-1x2.png, but there is no shot_000.png');
  });
});

describe('samePixels', () => {
  /** One pixel is the whole difference a re-shot panel can have, and it must count. */
  test('tells two pictures one pixel apart', async () => {
    const base = sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } });
    const dot = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const plain = await base.clone().png().toBuffer();
    const dotted = await base.clone().composite([{ input: dot, left: 3, top: 3 }]).png().toBuffer();

    const result = samePixels(await pixelsOf(plain), await pixelsOf(dotted));

    expect(result).toBe(false);
  });
});

/** A walk on a fake emulator whose screens are the given bytes, one a step, wrapping like the C does. */
function fakeWalk(screens: string[]): { io: WalkIo; saved: string[] } {
  const saved: string[] = [];
  let step = 0;

  return {
    saved,
    io: {
      folder: 'shots',
      screenshot: () => Buffer.from(screens[step % screens.length]),
      tap: () => {
        step++;
      },
      settle: () => {},
      save: (index, png) => {
        saved[index] = png.toString();
      },
    },
  };
}

describe('shootSteps', () => {
  /** Two panels can draw the same, and dropping the second would shift every picture after it onto the wrong name. */
  test('saves every step, even one that draws the same as another', () => {
    const { io, saved } = fakeWalk(['a', 'b', 'b', 'c']);

    shootSteps(io, 4);

    expect(saved).toEqual(['a', 'b', 'b', 'c']);
  });

  /** A panel that reads the real clock can draw differently each time, so nothing compares the shots with each other. */
  test('takes no tap past the last step', () => {
    const { io, saved } = fakeWalk(['a', 'b']);

    shootSteps(io, 2);

    expect(saved).toEqual(['a', 'b']);
  });
});

describe('checkBuild', () => {
  /** The header of a build made from the file as it stands, with its .pbw built after it. */
  const HEADER = '#pragma once\n#define DEV_CONFIG_FINGERPRINT "0123456789abcdef" ///< what this build shows\n';

  /** A stale build with a walk of another length or order would put every picture under another panel's name. */
  test('refuses a build whose fingerprint differs from the file\'s', () => {
    const call = () => checkBuild(HEADER, 1000, 2000, 'fedcba9876543210', 'gridlock');

    expect(call).toThrow("gridlock's dev build shows something other than paf.dev.config.json lays out now");
  });

  /** A build that stopped after writing its header leaves the .pbw from the build before, which shows the old walk. */
  test('refuses a .pbw older than its header', () => {
    const call = () => checkBuild(HEADER, 2000, 1000, '0123456789abcdef', 'gridlock');

    expect(call).toThrow("gridlock's .pbw is older than the dev build's header");
  });

  /** A release build takes the header away, and its .pbw has no walk at all. */
  test('refuses a sandbox with no dev header', () => {
    const call = () => checkBuild(null, 0, 2000, '0123456789abcdef', 'gridlock');

    expect(call).toThrow('gridlock has no dev build to install. Build it again with paf build gridlock --dev');
  });

  /** The build made from the file as it stands is the one the tool installs and shoots. */
  test('takes a build made from the file as it stands', () => {
    const call = () => checkBuild(HEADER, 1000, 2000, '0123456789abcdef', 'gridlock');

    expect(call).not.toThrow();
  });
});

describe('harnessFingerprint', () => {
  /** A walk one step shorter has to read as another build, or a stale one would pass the check. */
  test('changes when the walk loses a step', () => {
    const switches = readDevHarness({}, 'paf.dev.config.json', () => []).unit;
    const step = { panel: 'steps', size: '1x2', panelId: '6', sizeId: '0' };
    const both = harnessFingerprint(switches, { kind: 'panels', steps: [step, { ...step, panel: 'calories' }] });

    const result = harnessFingerprint(switches, { kind: 'panels', steps: [step] });

    expect(result).not.toBe(both);
  });
});

describe('parseThumbnailArgs', () => {
  /** Cropping shots already taken installs nothing, so a target beside it is a mistake. */
  test('refuses --target with --shots', () => {
    const call = () => parseThumbnailArgs(['gridlock', '--target=gridlock-face', '--shots=.tmp/old']);

    expect(call).toThrow('--shots crops screenshots already taken, so it installs no build for --target to pick');
  });
});
