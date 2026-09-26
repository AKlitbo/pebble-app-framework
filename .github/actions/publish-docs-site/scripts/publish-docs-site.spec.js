/**
 * Specs for the step that publishes a version of the docs onto the GitHub Pages branch.
 *
 * A wrong publish lands on the live site. What is worth pinning is the first publish starting from an empty
 * tree rather than the framework's own source, a later publish building on the branch as it stands, a push
 * another publish beat starting over from a fresh fetch, and a build that changes nothing leaving the branch
 * alone.
 *
 * git is faked. The worktree is a real folder in a temporary directory, so the files the step writes there
 * can be read back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import publishDocsSite from './publish-docs-site.js';

const BEATEN = ' ! [rejected]        abc -> gh-pages (fetch first)';

let temp;
let built;
let worktree;

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-docs-site-'));
  built = path.join(temp, 'dist');
  fs.mkdirSync(built);
  fs.writeFileSync(path.join(built, 'index.html'), 'the new build');
  worktree = path.join(temp, 'docs-site-branch');
  vi.stubEnv('RUNNER_TEMP', temp);
  vi.stubEnv('SITE', 'docs/site/dist');
  vi.stubEnv('FOLDER', 'main');
  // the site input is a repo path, and the build it names sits in the temporary folder
  const realCopy = fs.cpSync;
  vi.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => false });
  vi.spyOn(fs, 'cpSync').mockImplementation((_source, target, options) => realCopy(built, target, options));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(temp, { recursive: true, force: true });
});

/**
 * Answers git the way a remote with or without the branch would.
 *
 * @param branchExists Whether ls-remote finds the branch.
 * @param pushes The push results in order, the last one repeating.
 * @param existing Version folders already on the branch, laid into the worktree when it is added.
 * @param unchanged Whether the new tree matches the branch's.
 */
function remote({ branchExists = true, pushes = [{}], existing = [], unchanged = false } = {}) {
  let pushCount = 0;
  return ({ args }) => {
    const [command] = args;
    if (command === 'log') {
      return { stdout: 'Andrew\nme@example.com\nabc1234\n' };
    }
    if (command === 'ls-remote') {
      return { exitCode: branchExists ? 0 : 2 };
    }
    if (command === 'rev-parse' && args[1] === 'FETCH_HEAD') {
      return { stdout: 'parent1\n' };
    }
    if (command === 'rev-parse') {
      return { stdout: unchanged ? 'tree1\n' : 'tree0\n' };
    }
    if (command === 'worktree' && args[1] === 'add') {
      for (const folder of existing) {
        fs.mkdirSync(path.join(worktree, folder), { recursive: true });
      }
      return {};
    }
    if (command === 'write-tree') {
      return { stdout: 'tree1\n' };
    }
    if (args.includes('commit-tree')) {
      return { stdout: 'commit1\n' };
    }
    if (command === 'push') {
      const result = pushes[Math.min(pushCount, pushes.length - 1)];
      pushCount += 1;
      return result;
    }
    return {};
  };
}

async function publish(answer) {
  const core = fakeCore();
  const exec = fakeExec(answer);
  await publishDocsSite({ core, exec });
  const calls = exec.getExecOutput.mock.calls.map(([, args, options]) => ({ args, cwd: options && options.cwd }));
  return { core, calls };
}

describe('publish-docs-site', () => {
  /** Leaving out the clear on a first publish would put the framework's whole source tree onto the Pages branch. */
  test('starts a first publish from an empty tree with no parent', async () => {
    const { core, calls } = await publish(remote({ branchExists: false }));

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(calls.some((call) => call.args[0] === 'rm' && call.cwd === worktree)).toBe(true);
    const commitTree = calls.find((call) => call.args.includes('commit-tree'));
    expect(commitTree.args).not.toContain('-p');
  });

  /** A bare branch name also matches a branch such as archive/gh-pages, and the first publish then failed its fetch. */
  test('asks the remote for the branch by its full ref', async () => {
    const { calls } = await publish(remote());

    expect(calls.find((call) => call.args[0] === 'ls-remote').args).toEqual(['ls-remote', '--exit-code', 'origin', 'refs/heads/gh-pages']);
  });

  /** A publish that dropped the parent would make the branch forget every version published before it. */
  test('builds on the branch as it stands and keeps the versions already there', async () => {
    const { calls } = await publish(remote({ existing: ['v2.0.0'] }));

    const commitTree = calls.find((call) => call.args.includes('commit-tree'));
    expect(commitTree.args).toEqual(expect.arrayContaining(['-p', 'parent1']));
    expect(calls.find((call) => call.args[0] === 'push').args).toEqual(['push', 'origin', 'commit1:refs/heads/gh-pages']);
    const listed = JSON.parse(fs.readFileSync(path.join(worktree, 'versions.json'), 'utf8'));
    expect(listed.versions).toEqual(expect.arrayContaining(['main', 'v2.0.0']));
    expect(fs.readFileSync(path.join(worktree, 'main', 'index.html'), 'utf8')).toBe('the new build');
  });

  /** A retry that pushed the same commit again would be refused forever, since it sits on the branch as it was. */
  test('starts over from a fresh fetch when another publish pushed first', async () => {
    const { core, calls } = await publish(remote({ pushes: [{ exitCode: 1, stderr: BEATEN }, {}] }));

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(calls.filter((call) => call.args[0] === 'fetch')).toHaveLength(2);
    expect(calls.filter((call) => call.args[0] === 'push')).toHaveLength(2);
  });

  /** Giving up quietly would leave the site on the old docs with a green run. */
  test('fails once every try was beaten', async () => {
    const { core } = await publish(remote({ pushes: [{ exitCode: 1, stderr: BEATEN }] }));

    expect(core.setFailed).toHaveBeenCalledWith('Another publish reached gh-pages first on each of 5 tries, so the main docs did not go up. Run the workflow again.');
  });

  /** An empty commit on every rerun would fill the branch history with publishes that changed nothing. */
  test('leaves the branch alone when the build changes nothing', async () => {
    const { core, calls } = await publish(remote({ unchanged: true }));

    expect(calls.some((call) => call.args.includes('commit-tree'))).toBe(false);
    expect(calls.some((call) => call.args[0] === 'push')).toBe(false);
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('Nothing changed');
  });

  /** The folder is emptied before the build goes in, so a stray name would clear some other part of the branch. */
  test('refuses a folder that is not a version', async () => {
    vi.stubEnv('FOLDER', 'assets');

    const { core, calls } = await publish(remote());

    expect(core.setFailed).toHaveBeenCalledWith("folder 'assets' is not main or a release tag such as v2.0.0, so it is not published.");
    expect(calls).toHaveLength(0);
  });
});
