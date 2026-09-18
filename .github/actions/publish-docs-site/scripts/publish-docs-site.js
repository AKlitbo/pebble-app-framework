/**
 * Publishes one version of the docs site onto the branch GitHub Pages serves.
 *
 * Each version sits in a folder of its own on the branch, main in main/ and a release in a folder named for
 * its tag. This swaps the one folder for the new build and leaves the others alone. Then it rewrites
 * versions.json, which fills the version picker on every page, and the front page, which sends a visitor on
 * to the latest release. The branch is made the first time, with no history behind it. A push that another
 * publish beat to the branch starts over from a fresh copy of it, so two publishes at once both land.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fail, step, existingPath, firstLine, markdownTable } = require('../../../shared/lib');
const { isVersionFolder, listVersions, redirectPage, pushWasBeaten, publishWithRetries } = require('./lib');

// each try fetches the branch again, so a handful covers every publish one workflow can start at once
const PUSH_TRIES = 5;

module.exports = step(async ({ core, exec }) => {
  const site = existingPath(process.env.SITE || 'docs/site/dist', 'site');
  const folder = process.env.FOLDER;
  const branch = process.env.BRANCH || 'gh-pages';
  if (!isVersionFolder(folder)) {
    fail(`folder '${folder}' is not main or a release tag such as v2.0.0, so it is not published.`);
  }

  const git = async (args, cwd = '.') => {
    const result = await exec.getExecOutput('git', args, { cwd, ignoreReturnCode: true });
    if (result.exitCode !== 0) {
      fail(`git ${args[0]} exited ${result.exitCode}. ${firstLine(result.stderr)}`);
    }
    return result;
  };

  // the commit identity and message come from the commit the site was built from
  // the runner has no git identity of its own
  const source = await git(['log', '-1', '--format=%an%n%ae%n%h', 'HEAD']);
  const [name, email, commit] = source.stdout.trim().split('\n');
  const worktree = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'docs-site-branch');
  let listed = { latest: null, versions: [] };

  // one try from a fresh copy of the branch
  // a push another publish beat comes back as beaten, and the next try starts over on top of it
  const attempt = async () => {
    // --exit-code makes a missing branch exit 2, which tells it apart from not reaching the remote at all
    const found = await exec.getExecOutput('git', ['ls-remote', '--exit-code', '--heads', 'origin', branch], { ignoreReturnCode: true, silent: true });
    if (found.exitCode !== 0 && found.exitCode !== 2) {
      fail(`git ls-remote exited ${found.exitCode}. ${firstLine(found.stderr)}`);
    }

    // the worktree is left detached and the commit is pushed straight to the branch
    // so no local branch is made, and a retry never trips over one left by the try before
    await exec.getExecOutput('git', ['worktree', 'remove', '--force', worktree], { ignoreReturnCode: true, silent: true });
    fs.rmSync(worktree, { recursive: true, force: true });
    let parent = null;
    if (found.exitCode === 0) {
      await git(['fetch', '--depth=1', 'origin', branch]);
      parent = (await git(['rev-parse', 'FETCH_HEAD'])).stdout.trim();
      await git(['worktree', 'add', '--detach', worktree, parent]);
    } else {
      // the first publish starts from an empty tree, so the source checkout is cleared out of the worktree
      await git(['worktree', 'add', '--detach', worktree, 'HEAD']);
      await git(['rm', '-r', '-q', '--ignore-unmatch', '.'], worktree);
    }

    const target = path.join(worktree, folder);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(site, target, { recursive: true });

    const folders = fs.readdirSync(worktree, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    listed = listVersions(folders);
    fs.writeFileSync(path.join(worktree, 'versions.json'), `${JSON.stringify(listed, null, 2)}\n`);
    fs.writeFileSync(path.join(worktree, 'index.html'), redirectPage(listed.latest || listed.versions[0]));
    // without it GitHub Pages runs the branch through Jekyll, which drops any file whose name starts with _
    fs.writeFileSync(path.join(worktree, '.nojekyll'), '');

    await git(['add', '--all'], worktree);
    const tree = (await git(['write-tree'], worktree)).stdout.trim();
    if (parent !== null && tree === (await git(['rev-parse', `${parent}^{tree}`], worktree)).stdout.trim()) {
      return 'unchanged';
    }

    const parentArgs = parent === null ? [] : ['-p', parent];
    const message = `publish the ${folder} docs from ${commit}`;
    const made = await git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit-tree', tree, ...parentArgs, '-m', message], worktree);
    const pushed = await exec.getExecOutput('git', ['push', 'origin', `${made.stdout.trim()}:refs/heads/${branch}`], { cwd: worktree, ignoreReturnCode: true });
    if (pushed.exitCode === 0) {
      return 'pushed';
    }
    if (pushWasBeaten(pushed.stderr)) {
      core.info(`Another publish reached ${branch} first, so this one starts again on top of it.`);
      return 'beaten';
    }
    fail(`git push exited ${pushed.exitCode}. ${firstLine(pushed.stderr)}`);
  };

  const result = await publishWithRetries(attempt, PUSH_TRIES);
  if (result.outcome === 'beaten') {
    fail(`Another publish reached ${branch} first on each of ${PUSH_TRIES} tries, so the ${folder} docs did not go up. Run the workflow again.`);
  }
  const changed = result.outcome === 'pushed';
  const { versions } = listed;
  const front = listed.latest || versions[0];

  const summary = [
    `## Docs Site: ${folder}`,
    '',
    changed ? `Published to the \`${branch}\` branch.` : `Nothing changed, so \`${branch}\` was left as it was.`,
    '',
    markdownTable(['Version', 'Note'], versions.map((version) => [version, version === folder ? 'this build' : version === front ? 'front page' : ''])),
  ];
  await core.summary.addRaw(summary.join('\n'), true).write();
  core.info(changed ? `Published the ${folder} docs to ${branch}.` : `The ${folder} docs on ${branch} were already up to date.`);
});
