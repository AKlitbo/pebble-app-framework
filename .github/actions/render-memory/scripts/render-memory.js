/**
 * Puts every face's memory rows on the run summary as one table, closest to a limit first.
 *
 * The build is a matrix with one job per face, and a job summary belongs to one job. So each build job
 * uploads its rows through report-memory and this collects them, since the only question worth asking is
 * which face is closest to the edge, and that needs every face in one place. A row at 80% of a limit or more
 * also gets a warning, so it shows on the run itself and not only in the table.
 *
 * It reports and never fails on size, since the SDK already fails a build at the only limit that counts. A
 * face that failed to build has no rows, and the faces that did build are still worth seeing.
 */
const fs = require('node:fs');
const path = require('node:path');
const { step } = require('../../../shared/lib');
const { WARN_AT, rankRows, renderReport } = require('./lib');

module.exports = step(async ({ core }) => {
  const dir = process.env.MEMORY_DIR;

  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
  const rows = files.flatMap((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
  // with no rows every build job already failed or never reported, and those jobs carry the reason
  // failing here as well would add a red job that points away from it
  if (rows.length === 0) {
    const message = `No memory rows under ${dir}. Every build job either failed before it reported or never uploaded its rows.`;
    core.warning(message, { title: 'Memory Report' });
    await core.summary.addRaw(`## Memory\n\n${message}`, true).write();
    return;
  }

  const ranked = rankRows(rows);
  for (const entry of ranked.filter((candidate) => candidate.worst >= WARN_AT)) {
    const message = `${entry.target} on ${entry.platform} is at ${Math.floor(entry.worst)}% of its ${entry.tighter} limit.`;
    core.warning(message, { title: `${entry.face} Memory` });
  }

  await core.summary.addRaw(renderReport(ranked), true).write();
  core.info(`Reported ${rows.length} target and platform row(s) from ${files.length} face(s).`);
});
