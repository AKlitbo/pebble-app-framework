/**
 * Reads the SDK, pebble-tool, and Node a face's framework was built with.
 *
 * A face that has its own framework in paf/ builds with the toolchain that framework records in
 * toolchain.json, so a build in CI uses what the framework was tested with, and a pinned version
 * can be cached where latest never can. The face's paf/ has to be filled before this runs.
 */
const fs = require('node:fs');
const path = require('node:path');
const { fail, step, readJson, faceProject, fillHint } = require('../../../shared/lib');

/** The toolchain formats this action reads. A face left on an old framework keeps its old format. */
const FORMATS = [1];

module.exports = step(async ({ core }) => {
  const face = process.env.FACE || '';
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();

  const { project, framework, rel: relOf } = faceProject(workspace, face);

  const file = path.join(framework, 'toolchain.json');
  const rel = relOf(file);
  if (!fs.existsSync(file)) {
    fail(`${rel} is missing. ${fillHint(project)}`);
  }

  const toolchain = readJson(file, rel);
  if (!toolchain || typeof toolchain !== 'object' || Array.isArray(toolchain)) {
    fail(`${rel} does not hold a toolchain object.`);
  }
  if (!FORMATS.includes(toolchain.format)) {
    fail(`${rel} is format ${toolchain.format}, which this action does not read. Load the actions from a newer framework tag.`);
  }

  // a missing version would reach the install as the word undefined
  if (!toolchain.sdk || !toolchain.pebbleTool) {
    fail(`${rel} names no ${toolchain.sdk ? 'pebbleTool' : 'sdk'} version.`);
  }

  core.setOutput('sdk', String(toolchain.sdk));
  core.setOutput('pebble-tool', String(toolchain.pebbleTool));
  if (toolchain.node) {
    core.setOutput('node', String(toolchain.node));
  }
  // paf sync installs the project along with its paf/, and a build without node_modules would fail far
  // from the cause on a missing package
  if (!fs.existsSync(path.join(project, 'node_modules'))) {
    fail(`${relOf(project)} has no node_modules. Run paf sync before this step.`);
  }
  core.info(`${face} builds with SDK ${toolchain.sdk} and pebble-tool ${toolchain.pebbleTool}, from ${rel}.`);
});
