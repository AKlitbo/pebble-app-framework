/**
 * Measures what stops a face building, for each target and platform, and leaves the rows for render-memory.
 *
 * The heap figures come off the build log. The two sizes that really limit a face come off each app binary,
 * where the image is the file's size and the static size is the virtual_size field in its header. The rows go
 * to a JSON file for the action to upload, since the table that ranks every face is built in a later job.
 *
 * The heap figures only print when the build links, so an incremental build with nothing to relink has none.
 * CI always builds clean. It never fails a build for being large, since the SDK already does that at the
 * only limit that counts.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fail, step, insideRepo } = require('../../../shared/lib');
const { readBuildLog, readVirtualSize } = require('./lib');

module.exports = step(async ({ core }) => {
  const face = process.env.FACE;
  const log = process.env.BUILD_LOG || '';
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  // an empty input would read the repo folder itself, since the runner does not enforce required inputs
  // on a composite action
  if (!log) {
    fail('No log was given. Pass the build log the build step tees its output to.');
  }
  // the log is held inside the repo like every other action's path input
  const logPath = path.join(workspace, insideRepo(log, 'log'));
  if (!fs.existsSync(logPath)) {
    fail(`No build log at ${log}. The build step has to tee its output there.`);
  }
  const text = fs.readFileSync(logPath, 'utf8');
  if (!text.includes('APP MEMORY USAGE')) {
    fail(`${log} has no memory report. Either the build did not get as far as linking, or it was incremental and had nothing to relink.`);
  }

  const { rows: blocks, incomplete } = readBuildLog(text);
  for (const block of incomplete) {
    core.warning(`${block.target} on ${block.platform} printed a memory header without all its figures, so it has no row.`, { title: `${face} Memory` });
  }
  if (blocks.length === 0) {
    fail(`${log} has a memory report, but none of its figures could be read. The SDK may have changed how it prints them.`);
  }

  const rows = blocks.map((block) => {
    // a missing binary reads as 0 rather than dropping the row, so the gap still shows in the table
    const binRel = path.posix.join('targets', block.target, 'build', block.platform, 'pebble-app.bin');
    const binPath = path.join(workspace, binRel);
    let image = 0;
    let virtualSize = 0;
    if (fs.existsSync(binPath)) {
      const binary = fs.readFileSync(binPath);
      image = binary.length;
      virtualSize = readVirtualSize(binary);
    } else {
      core.warning(`${binRel} is missing, so its app image and static size read as 0.`, { title: `${face} Memory` });
    }
    return { face, target: block.target, platform: block.platform, image, virtualSize, resources: block.resources, footprint: block.footprint, free: block.free };
  });

  const file = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'memory', `${face}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  core.setOutput('file', file);

  for (const row of rows) {
    core.info(`${row.target} on ${row.platform}: app image ${row.image} bytes, static size ${row.virtualSize} bytes, free heap ${row.free} bytes.`);
  }
});
