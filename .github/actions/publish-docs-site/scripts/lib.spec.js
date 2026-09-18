/**
 * Specs for working out the docs versions on the Pages branch.
 *
 * The order decides what the version picker shows and where the site's front page goes. Folder names
 * sorted as plain text put v1.10.0 below v1.9.0, and a release candidate that counts as the latest would
 * send every visitor to docs for a version nobody can install. The folder check guards the one step that
 * empties a folder on the branch. The retry is what keeps a release published alongside a push to main
 * from being lost when both reach the branch at once.
 */
import { describe, expect, test } from 'vitest';
import { isVersionFolder, listVersions, publishWithRetries, pushWasBeaten, redirectPage } from './lib.js';

describe('isVersionFolder', () => {
  /** main and every release tag get published, release candidates included. */
  test.each(['main', 'v2.0.0', 'v1.2.0-rc.1', 'v10.0.0-beta'])('accepts %s', (name) => {
    const result = isVersionFolder(name);

    expect(result).toBe(true);
  });

  /** The folder is emptied before the build goes in, so a stray name could clear the branch root or another folder. */
  test.each(['', '.', '..', 'v2.0.0/../main', 'feature/docs', '2.0.0', 'v2.0', 'undefined'])('refuses %j', (name) => {
    const result = isVersionFolder(name);

    expect(result).toBe(false);
  });
});

describe('listVersions', () => {
  /** Sorted as text, v1.10.0 lands below v1.9.0 and the picker reads out of order. */
  test('puts main first and the releases newest first by number', () => {
    const result = listVersions(['v1.9.0', 'v1.10.0', 'main', 'v2.0.0']);

    expect(result.versions).toEqual(['main', 'v2.0.0', 'v1.10.0', 'v1.9.0']);
  });

  /** A candidate sorts below its release, so v1.2.0 shows above v1.2.0-rc.2, and rc.10 above rc.2. */
  test('puts a release candidate below the release it leads up to', () => {
    const result = listVersions(['v1.2.0-rc.2', 'v1.2.0', 'v1.2.0-rc.10', 'v1.1.0']);

    expect(result.versions).toEqual(['v1.2.0', 'v1.2.0-rc.10', 'v1.2.0-rc.2', 'v1.1.0']);
  });

  /** The front page opening a release candidate would show docs for an engine no face can move to yet. */
  test('skips a newer release candidate when picking the latest', () => {
    const result = listVersions(['main', 'v2.0.0', 'v2.1.0-rc.1']);

    expect(result.latest).toBe('v2.0.0');
  });

  /** Before the first release there is nothing to call latest, and the front page falls back to main. */
  test('has no latest before the first release', () => {
    const result = listVersions(['main', 'v1.2.0-rc.1']);

    expect(result.latest).toBeNull();
  });

  /** The branch root holds more than versions, and a stray folder listed in the picker would lead nowhere. */
  test('leaves out folders that are not versions', () => {
    const result = listVersions(['main', '.git', 'assets', 'v2.0.0']);

    expect(result.versions).toEqual(['main', 'v2.0.0']);
  });
});

describe('redirectPage', () => {
  /** A link from the domain root would land outside the repo's path on github.io and 404. */
  test('sends the visitor on to the version folder by a relative link', () => {
    const result = redirectPage('v2.0.0');

    expect(result).toContain('<meta http-equiv="refresh" content="0; url=v2.0.0/">');
  });
});

describe('pushWasBeaten', () => {
  /** Both are what git prints when another publish pushed after this one fetched, and a fresh try fixes them. */
  test.each([
    " ! [rejected]        HEAD -> gh-pages (fetch first)\nerror: failed to push some refs to 'https://github.com/AKlitbo/pebble-watchface-engine'",
    " ! [rejected]        HEAD -> gh-pages (non-fast-forward)\nerror: failed to push some refs to 'https://github.com/AKlitbo/pebble-watchface-engine'",
  ])('reads a rejected push as beaten', (stderr) => {
    const result = pushWasBeaten(stderr);

    expect(result).toBe(true);
  });

  /** Retrying a push the token cannot make would spend every try and bury the real message under the last one. */
  test('does not read a refused token as beaten', () => {
    const stderr = "remote: Permission to AKlitbo/pebble-watchface-engine.git denied to github-actions[bot].\nfatal: unable to access 'https://github.com/AKlitbo/pebble-watchface-engine/': The requested URL returned error: 403";

    const result = pushWasBeaten(stderr);

    expect(result).toBe(false);
  });
});

describe('publishWithRetries', () => {
  /** The race the retry exists for. A tag published while main was pushing would otherwise never reach the site. */
  test('tries again after another publish pushed first', async () => {
    const outcomes = ['beaten', 'beaten', 'pushed'];
    const attempt = async () => outcomes.shift();

    const result = await publishWithRetries(attempt, 5);

    expect(result).toEqual({ outcome: 'pushed', tries: 3 });
  });

  /** A branch that keeps moving has to end the step rather than loop until the job times out. */
  test('gives up once every try was beaten', async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      return 'beaten';
    };

    const result = await publishWithRetries(attempt, 5);

    expect(result).toEqual({ outcome: 'beaten', tries: 5 });
    expect(calls).toBe(5);
  });

  /** A publish with nothing new is done, and trying it again would only fetch the branch for nothing. */
  test('stops at the first try that did not lose a race', async () => {
    let calls = 0;
    const attempt = async () => {
      calls++;
      return 'unchanged';
    };

    const result = await publishWithRetries(attempt, 5);

    expect(result).toEqual({ outcome: 'unchanged', tries: 1 });
    expect(calls).toBe(1);
  });
});
