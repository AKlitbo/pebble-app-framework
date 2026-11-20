/**
 * A plugin app's actions, routed by name.
 *
 * A pin's `pluginAction`, or another app's `Pebble.invokeAction`, runs the plugin's action handler with
 * the action's name and its arguments. `handleActions` registers one handler that sends each name to
 * its own function, so a plugin app writes the actions and not the routing. Every request gets one
 * answer, built from only the fields the Pebble app reads, since it turns down an answer with a field
 * of the wrong type.
 */

import { namedCode, pluginPebble } from './runtime';
import type { ActionRequest, ActionResponder, ActionResult, PluginPebble } from './runtime';

/** One action, which gets the request's arguments and answers what the watch shows, or nothing for `Done`. */
export type ActionFunction = (args: Record<string, unknown>, request: ActionRequest) => ActionResult | void | Promise<ActionResult | void>;

/** The error code for a request naming an action the plugin does not have. */
export const INVALID_REQUEST = 'INVALID_REQUEST';

/** The error code for an action that threw without naming a code of its own. */
export const ACTION_FAILED = 'UNKNOWN';

/**
 * The code and the words an action that threw answers with. A thrown error whose `code` names
 * something, as `namedCode` reads one, keeps it, and any other answers `UNKNOWN`.
 */
function errorAnswer(error: unknown): { code: string; message?: string } {
  const failure = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const code = namedCode(failure.code) || ACTION_FAILED;
  const message = typeof failure.message === 'string' && failure.message ? failure.message : typeof error === 'string' ? error : undefined;

  return message === undefined ? { code } : { code, message };
}

/**
 * The answer the Pebble app reads, field by field from what an action handed back. `text` and
 * `semanticResult` go only when they are text, and `refreshed` keeps only its text entries. Anything
 * else is left out, and a result that is not an object answers nothing but `Done`.
 */
function resultAnswer(result: unknown): ActionResult {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return {};
  }

  const given = result as { text?: unknown; semanticResult?: unknown; refreshed?: unknown };
  const answer: ActionResult = {};

  if (typeof given.text === 'string') {
    answer.text = given.text;
  }

  if (typeof given.semanticResult === 'string') {
    answer.semanticResult = given.semanticResult;
  }

  if (Array.isArray(given.refreshed)) {
    answer.refreshed = given.refreshed.filter((source): source is string => typeof source === 'string');
  }

  return answer;
}

/**
 * Answers one action request from the actions given.
 *
 * A request naming no action, or one not among them, answers `INVALID_REQUEST`. An action that throws
 * or rejects answers its error's `code`, such as `AUTH_REQUIRED`, or `UNKNOWN` when it names none,
 * with its message. Missing arguments, or arguments sent as a list, read as none.
 *
 * @param actions The actions by name.
 * @param request The request, which may carry anything.
 * @param respond The responder, which gets one answer.
 * @return Resolves once the answer is sent.
 */
export async function answerAction(actions: Readonly<Record<string, ActionFunction>>, request: ActionRequest, respond: ActionResponder): Promise<void> {
  const name = request && typeof request.action === 'string' ? request.action : '';

  if (!name || !Object.prototype.hasOwnProperty.call(actions, name)) {
    respond.error(INVALID_REQUEST, name ? `no action named ${name}` : 'the request names no action');
    return;
  }

  const args = request.args && typeof request.args === 'object' && !Array.isArray(request.args) ? request.args : {};
  let result: ActionResult | void;

  try {
    result = await actions[name](args, { action: name, args });
  } catch (error) {
    const { code, message } = errorAnswer(error);

    respond.error(code, message);
    return;
  }

  respond.ok(resultAnswer(result));
}

/**
 * Registers the plugin's action handler, which sends each request to the action it names.
 *
 * @param actions The actions by name, such as `{ complete: (args) => ... }`.
 * @param pebble The plugin runtime's `Pebble`, normally the script's own.
 */
export function handleActions(actions: Readonly<Record<string, ActionFunction>>, pebble: PluginPebble = pluginPebble()): void {
  pebble.registerActionHandler((request, respond) => answerAction(actions, request, respond));
}

export default { handleActions, answerAction, INVALID_REQUEST, ACTION_FAILED };
