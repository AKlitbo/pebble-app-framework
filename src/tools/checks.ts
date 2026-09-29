/**
 * How the face-side checks report what they find.
 *
 * Each check under tools/ and plugins/ looks at every face in the unit and returns a line per
 * problem. paf check runs them from the unit, and a check that finds anything exits non-zero so CI
 * fails on it.
 */
import { listFaceNames } from './faces.ts';
import { MOUNTED } from './paths.ts';

/**
 * The faces a check looks at. A check that looked at no face would report every face current, so
 * a framework no unit mounts, or a unit holding no faces, stops the check instead.
 *
 * @param mounted Whether a unit mounts the framework, which a spec passes in.
 * @param list Where the unit's faces come from, which a spec passes in.
 * @return Every face in the unit.
 */
export function facesToCheck(mounted: boolean = MOUNTED, list: () => string[] = listFaceNames): string[] {
  if (!mounted) {
    throw new Error('No unit mounts this framework, so there are no faces to check. The unit lists paf in its package.json workspaces.');
  }
  const faces = list();
  if (faces.length === 0) {
    throw new Error('The unit holds no faces to check.');
  }
  return faces;
}

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
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

/**
 * Runs one face's part of a check. Anything it throws becomes a problem line for that face, so one
 * broken face never hides what the check finds in the others.
 *
 * @param face The face being checked.
 * @param problems Where the face's problems go.
 * @param check The face's part of the check.
 */
export async function checkFace(face: string, problems: string[], check: () => void | Promise<void>): Promise<void> {
  try {
    await check();
  } catch (error) {
    problems.push(`${face}: could not be checked, ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Prints what a check found and sets the exit code from it.
 *
 * @param name What was checked, for the line printed when everything is current.
 * @param problems One line per problem, empty when there are none.
 */
export function reportProblems(name: string, problems: string[]): void {
  if (problems.length === 0) {
    console.log(`${name}: every face is current`);
    return;
  }
  for (const problem of problems) {
    console.error(problem);
  }
  process.exitCode = 1;
}
