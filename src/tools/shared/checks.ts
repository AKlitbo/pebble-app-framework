/**
 * How the face-side checks report what they find.
 *
 * Each check under tools/ and plugins/ looks at every face in the unit and returns a line per
 * problem. paf check runs them from the unit, and a check that finds anything exits non-zero so CI
 * fails on it.
 */
import { describeFailure, reportFailure } from './tool-error.ts';

/**
 * Prints what a check found and sets the exit code from it, or prints why the check could not run.
 *
 * @param name What was checked, for the line printed when everything is current.
 * @param run The check, giving one line per problem.
 */
export async function runCheck(name: string, run: () => Promise<string[]>): Promise<void> {
  try {
    reportProblems(name, await run());
  } catch (error) {
    reportFailure(error);
  }
}

/**
 * Runs one face's part of a check. Anything it throws becomes a problem line for that face, so one
 * broken face never hides what the check finds in the others. A ToolError gives its message, and
 * anything else is a bug in the check, so it gives its stack to show where.
 *
 * @param face The face being checked.
 * @param problems Where the face's problems go.
 * @param check The face's part of the check.
 */
export async function checkFace(face: string, problems: string[], check: () => void | Promise<void>): Promise<void> {
  try {
    await check();
  } catch (error) {
    problems.push(`${face}: could not be checked, ${describeFailure(error)}`);
  }
}

/** Prints what a check found and sets the exit code from it. */
function reportProblems(name: string, problems: string[]): void {
  if (problems.length === 0) {
    console.log(`${name}: every face is current`);
    return;
  }

  for (const problem of problems) {
    console.error(problem);
  }

  process.exitCode = 1;
}
