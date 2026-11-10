/**
 * Measures what stops a face building, for each target and platform, and leaves the rows for render-memory.
 *
 * The heap figures come off the build log. The two sizes that really limit a face come off each app binary,
 * where the image is the file's size and the static size is the virtual_size field in its header. The rows go
 * to a JSON file for the action to upload, since the table that ranks every face is built in a later job.
 *
 * The heap figures only print when the build links, so an incremental build with nothing to relink has none.
 * CI always builds clean. It never fails a build for being large, since the SDK already fails one that passes
 * its platform's app image or memory limit.
 *
 * A plugin app runs on the phone and links no watch binary, so its build prints no memory report. It gets a
 * line saying so and an empty list of rows, so the upload after this step still finds its file.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fail, step, insideRepo, faceProject, findFaceProject, readJson } = require('../../../shared/lib');
const { readBuildLog, readVirtualSize } = require('./lib');

/**
 * Writes a face's rows where the upload step reads them.
 *
 * @param face The face the rows are for.
 * @param rows The rows, empty for a plugin app.
 * @return The file it wrote.
 */
function writeRows(face, rows) {
  const file = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'memory', `${face}.json`);

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows));
  return file;
}

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

  // the appinfo is what the manifest's projectType comes from, and it is known before the build names any target
  const found = findFaceProject(workspace, face);
  const appinfoRel = found ? path.relative(workspace, path.join(found.face, 'pebble.appinfo.json')).split(path.sep).join('/') : '';

  if (found && readJson(path.join(workspace, appinfoRel), appinfoRel).projectType === 'plugin') {
    core.info(`${face} is a plugin app, which links no watch binary, so it has no memory report.`);
    core.setOutput('file', writeRows(face, []));
    return;
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

  // the build writes targets/ into the face's project, which is its own folder or its family's
  const { rel } = faceProject(workspace, face);

  const rows = blocks.map((block) => {
    // a missing binary reads as 0 rather than dropping the row, so the gap still shows in the table
    const binRel = rel(`targets/${block.target}/build/${block.platform}/pebble-app.bin`);
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

  core.setOutput('file', writeRows(face, rows));

  for (const row of rows) {
    core.info(`${row.target} on ${row.platform}: app image ${row.image} bytes, static size ${row.virtualSize} bytes, free heap ${row.free} bytes.`);
  }
});
