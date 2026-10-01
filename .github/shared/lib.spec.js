/**
 * Specs for the helpers every action script shares.
 *
 * repoPath decides where every annotation lands, so a path it gets wrong puts a failure on no line or on
 * the wrong file. step decides whether a failing check reads as a plain failure or as a crash in the
 * script. existingPath is what stops a mistyped input reaching a tool. findFaceProject decides where a
 * release and a memory report look for a face's build output. Those are what is worth pinning.
 */
import fs from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, tempTree } from './fakes.js';
import path from 'node:path';
import { existingPath, faceProject, fail, fenceFor, fillHint, findFaceProject, markdownTable, repoPath, step } from './lib.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('step', () => {
  /** A failing check would otherwise show as a crash in the script, with a stack trace nobody needs. */
  test('fails the step with the plain message of an expected failure', async () => {
    const core = fakeCore();

    await step(async () => fail('2 test(s) failed.'))({ core });

    expect(core.setFailed).toHaveBeenCalledWith('2 test(s) failed.');
  });

  /** A bug in the script passed off as a failing check would hide the stack trace that explains it. */
  test('lets a real crash through with its stack trace', async () => {
    const core = fakeCore();

    const run = step(async () => {
      throw new TypeError('cannot read properties of undefined');
    })({ core });

    await expect(run).rejects.toThrow('cannot read properties of undefined');
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

describe('repoPath', () => {
  /** ESLint and Vitest print absolute paths, and an annotation with the runner's workspace in front lands on no file. */
  test('drops the workspace from an absolute path inside it', () => {
    vi.stubEnv('GITHUB_WORKSPACE', '/home/runner/work/engine/engine');

    const result = repoPath('/home/runner/work/engine/engine/ts/stock/cache.spec.ts');

    expect(result).toBe('ts/stock/cache.spec.ts');
  });

  /** gcc and Unity print paths relative to tests/c/spec, and left that way every C failure would point outside the repo. */
  test('joins a relative path onto the folder the tool ran in', () => {
    const result = repoPath('../../../src/c/core/math/pct.spec.c', 'tests/c/spec');

    expect(result).toBe('src/c/core/math/pct.spec.c');
  });

  /** A local run on Windows prints backslashes and can change the drive letter's case, and neither may stop the match. */
  test('matches a Windows workspace whatever the slashes and the drive letter case', () => {
    vi.stubEnv('GITHUB_WORKSPACE', 'C:\\Temp\\engine');

    const result = repoPath('c:/Temp/engine/tools/faces.ts');

    expect(result).toBe('tools/faces.ts');
  });
});

describe('existingPath', () => {
  /** A path out of the checkout would point a tool at something other than this repo. */
  test.each([['..'], ['../elsewhere'], ['/etc/passwd'], ['C:/Windows']])("refuses '%s'", (given) => {
    const call = () => existingPath(given, 'config');

    expect(call).toThrow(`config '${given}' has to be a relative path inside the repo.`);
  });

  /** A mistyped input would otherwise surface as the tool's own confusing error, which never names the input. */
  test('refuses a path that is not there', () => {
    vi.spyOn(fs, 'statSync').mockReturnValue(undefined);

    const call = () => existingPath('config/missing.ts', 'config');

    expect(call).toThrow("config 'config/missing.ts' does not exist.");
  });
});

describe('fenceFor', () => {
  /** A doc comment's own ``` line would close a same-length fence and spill the rest of the output into the summary as markdown. */
  test('makes the fence longer than any run of backticks in the text', () => {
    const result = fenceFor('/**\n * ```c\n * x = 1\n * ````\n */');

    expect(result).toBe('`````');
  });
});

describe('markdownTable', () => {
  /** A message holding a | would split its row and push every later cell into the wrong column on the summary. */
  test('escapes a | inside a cell', () => {
    const result = markdownTable(['Message'], [['a | b']]);

    expect(result).toBe('| Message |\n| --- |\n| a \\| b |');
  });

  /** The summary read <void> in a tsc message as an HTML tag, so Promise<void> showed as just Promise. */
  test('escapes angle brackets inside a cell', () => {
    const result = markdownTable(['Message'], [['Promise<void>']]);

    expect(result).toBe('| Message |\n| --- |\n| Promise&lt;void&gt; |');
  });

  /** Inside backticks the summary shows an escape as written, so a typescript-eslint type read Promise&lt;void&gt;. */
  test('leaves angle brackets inside backtick code alone', () => {
    const result = markdownTable(['Message'], [['Unsafe argument of type `Promise<void>` for <x>']]);

    expect(result).toBe('| Message |\n| --- |\n| Unsafe argument of type `Promise<void>` for &lt;x&gt; |');
  });
});

/** Writes files into a fresh temp folder for the lookup to search. */
function tree(files) {
  return tempTree(files, 'face-project-');
}

describe('findFaceProject', () => {
  /** A family with its own framework keeps its build output in its own folder, not the repo root. */
  test('finds the family folder a face in it builds from', () => {
    const root = tree({
      'watchfaces/mosaic/core/.gitkeep': '',
      'watchfaces/mosaic/gridlock/pebble.appinfo.json': '{ "name": "gridlock" }',
    });

    const result = findFaceProject(root, 'gridlock');

    expect(result).toEqual({ project: path.join(root, 'watchfaces', 'mosaic'), face: path.join(root, 'watchfaces', 'mosaic', 'gridlock') });
  });

  /**
   * A folder of faces with no core/ is not a family, and the tools in its paf/ find no faces there. Taken
   * as the project, the release read a paf/ whose tools could not find the face.
   */
  test('finds nothing in a folder under watchfaces/ that is neither a family nor a face', () => {
    const root = tree({ 'watchfaces/contour/ridgeline/pebble.appinfo.json': '{ "name": "ridgeline" }' });

    const result = findFaceProject(root, 'ridgeline');

    expect(result).toBeNull();
  });

  /**
   * A face that is a project of its own builds there, where the tools name it by its appinfo. Found by
   * its folder instead, its release tag never matched the face the build made.
   */
  test('finds a face that is its own project by its appinfo name', () => {
    const root = tree({ 'watchfaces/gridlock/pebble.appinfo.json': '{ "name": "gridlock-face" }' });

    const result = findFaceProject(root, 'gridlock-face');

    expect(result).toEqual({ project: path.join(root, 'watchfaces', 'gridlock'), face: path.join(root, 'watchfaces', 'gridlock') });
  });

  /** A repo keeps its apps under watchapps/, and a release of one found nothing there and stopped. */
  test('finds a face in a family under watchapps/', () => {
    const root = tree({
      'watchapps/toolbox/core/.gitkeep': '',
      'watchapps/toolbox/timer/pebble.appinfo.json': '{ "name": "timer" }',
    });

    const result = findFaceProject(root, 'timer');

    expect(result).toEqual({ project: path.join(root, 'watchapps', 'toolbox'), face: path.join(root, 'watchapps', 'toolbox', 'timer') });
  });

  /** A family can be a repo of its own, with its faces beside its core/, and setup-pebble has to find them there. */
  test('finds a face straight under a family at the repo root', () => {
    const root = tree({
      'core/.gitkeep': '',
      'ridgeline/pebble.appinfo.json': '{ "name": "ridgeline" }',
    });

    const result = findFaceProject(root, 'ridgeline');

    expect(result).toEqual({ project: root, face: path.join(root, 'ridgeline') });
  });

  /** A repo that is one face names it in its appinfo, since the folder is named after wherever it was cloned. */
  test('finds a face at the repo root by its appinfo name', () => {
    const root = tree({ 'pebble.appinfo.json': '{ "name": "lcars-stardate" }' });

    const result = findFaceProject(root, 'lcars-stardate');

    expect(result).toEqual({ project: root, face: root });
  });

  /** A release tag names one face, and picking either of two would publish the wrong face's build and notes. */
  test('stops on two faces with the same name', () => {
    const root = tree({
      'watchfaces/mosaic/core/.gitkeep': '',
      'watchfaces/mosaic/clock/pebble.appinfo.json': '{ "name": "clock" }',
      'watchapps/toolbox/core/.gitkeep': '',
      'watchapps/toolbox/clock/pebble.appinfo.json': '{ "name": "clock" }',
    });

    const result = () => findFaceProject(root, 'clock');

    expect(result).toThrow(/Two faces are named 'clock', at watchfaces\/mosaic\/clock and watchapps\/toolbox\/clock/);
  });

  /** A release tag naming a face the repo does not have has to stop the release, not build from nowhere. */
  test('finds nothing for a face the repo does not have', () => {
    const root = tree({ 'core/.gitkeep': '' });

    const result = findFaceProject(root, 'missing');

    expect(result).toBeNull();
  });

  /** A face input reaching out of the repo climbed to the filesystem root, and the toolchain and build output were read from there. */
  test('finds nothing for a name that reaches into another folder', () => {
    const base = tree({ 'repo/core/.gitkeep': '', 'other/face/pebble.appinfo.json': '{ "name": "face" }' });

    const result = findFaceProject(path.join(base, 'repo'), '../other/face');

    expect(result).toBeNull();
  });
});

describe('faceProject', () => {
  /** A mistyped release tag fell back to the repo root and stopped on a paf/ that was never there, rather than on the name. */
  test('stops on a face the repo does not have', () => {
    const root = tree({ 'watchfaces/gridlock/pebble.appinfo.json': '{ "name": "gridlock" }' });

    const result = () => faceProject(root, 'gridlok');

    expect(result).toThrow("This repo has no face called 'gridlok'.");
  });

  /** A unit still on framework 3 was told its face did not exist, with nothing to say its appinfo sat in the old place. */
  test('names an appinfo still in config/ when the face is not found', () => {
    const root = tree({
      'watchfaces/mosaic/core/.gitkeep': '',
      'watchfaces/mosaic/gridlock/config/pebble.appinfo.json': '{ "name": "gridlock" }',
    });

    const result = () => faceProject(root, 'gridlock');

    expect(result).toThrow('watchfaces/mosaic/gridlock/config/pebble.appinfo.json is where framework 3 keeps an appinfo');
  });
});

describe('fillHint', () => {
  /** A unit paf 1.0.0 filled has its framework in lib/, and telling it to sync again only fills lib/ again. */
  test('names the paf a unit needs when its framework is in lib/', () => {
    const root = tree({ 'lib/package.json': '{ "name": "pebble-app-framework" }' });

    const result = fillHint(root);

    expect(result).toBe('Its framework is in lib/, which paf 1.0.0 fills. This framework needs paf 2.0.0, which fills paf/.');
  });

  /** A unit with no framework at all only needs a sync. */
  test('says to sync when the unit holds no framework', () => {
    const root = tree({ 'pebble.appinfo.json': '{ "name": "gridlock" }' });

    const result = fillHint(root);

    expect(result).toBe('Run paf sync before this step.');
  });
});
