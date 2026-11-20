/**
 * Timeline pins from a plugin app, typed from the pin guide, and the calls that hand them to the
 * Pebble app without ever ending the run that made them.
 *
 * Since Pebble app 1.18.0 a plugin's `Pebble` has `insertTimelinePin` and `deleteTimelinePin`, as
 * PebbleKit JS does. The Pebble app answers neither and never rejects. A pin the plugin has no
 * `Timeline` grant for, one that does not parse, and a delete of an id it does not know are all
 * dropped without a word. So `insertPin` and `deletePin` say only whether the call was handed over,
 * and a plugin that has to know the pin can show checks `Timeline` first with `Pebble.permissions.query`
 * where the runtime has it. A call throws only when the pin cannot be turned into JSON, and both
 * wrappers catch a throw and a rejection alike, so a bad pin never ends the run. The Pebble app ends
 * the run as soon as the request is answered, so make every pin call before answering.
 */

import { failureReason } from './runtime';
import type { PluginPebble } from './runtime';

/**
 * The layouts a pin, a reminder, or a notification can take. A pin takes one of the four `Pin`
 * layouts, a reminder `genericReminder`, and a notification `genericNotification` or `commNotification`.
 */
export type PinLayoutType = 'genericPin' | 'calendarPin' | 'sportsPin' | 'weatherPin' | 'genericReminder' | 'genericNotification' | 'commNotification';

/**
 * What a pin, a reminder, or a notification shows. Which fields a layout reads, and which it needs,
 * are listed for each layout in the pin guide.
 */
export interface PinLayout {
  type: PinLayoutType;
  title?: string;
  /** The title in the timeline's list, where a layout reads it. */
  shortTitle?: string;
  subtitle?: string;
  /** The subtitle in the timeline's list, where a layout reads it. */
  shortSubtitle?: string;
  /** Up to 512 characters. */
  body?: string;
  /** A system icon, such as `system://images/TIMELINE_CALENDAR`. */
  tinyIcon?: string;
  smallIcon?: string;
  largeIcon?: string;
  /** Where the event is, read by `calendarPin` and `weatherPin`. */
  locationName?: string;
  /** A six digit hex colour or an SDK colour name, such as `mintgreen`. Pins only. */
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  /** Section headings, under 128 characters in all. Pins only, as many as `paragraphs`. */
  headings?: string[];
  /** Section text, under 1024 characters in all. Pins only, as many as `headings`. */
  paragraphs?: string[];
  /** When the pin's data was last updated, as an ISO date and time. */
  lastUpdated?: string;
  /** Whether `weatherPin` shows the pin's time, `pin`, or none. */
  displayTime?: 'pin' | 'none';
  rankAway?: string;
  rankHome?: string;
  /** Up to 4 characters. */
  nameAway?: string;
  /** Up to 4 characters. */
  nameHome?: string;
  recordAway?: string;
  recordHome?: string;
  scoreAway?: string;
  scoreHome?: string;
  sportsGameState?: 'in-game' | 'pre-game';
}

/** A notification shown when a pin is first inserted, or when a later insert changes it. */
export interface PinNotification {
  layout: PinLayout;
  /** For `updateNotification` only, the pin's new time. The watch shows the update only when this is newer than the last. */
  time?: string;
  /** Actions on the notification, such as a `pluginAction`. */
  actions?: PinAction[];
}

/** A reminder the watch shows at its time, even with the phone away. */
export interface PinReminder {
  /** When to show it, as an ISO date and time. */
  time: string;
  layout: PinLayout;
}

/**
 * An action that runs the plugin's own action handler with `action` and `args`. The watch shows the
 * handler's `text`, or `Done`, or `Failed` on an error. With `inputArg` the wearer replies by voice,
 * emoji, or one of `replies`, and the reply arrives in `args` under that name.
 */
export interface PluginPinAction {
  title: string;
  type: 'pluginAction';
  action: string;
  args: Record<string, unknown>;
  inputArg?: string;
  replies?: string[];
}

/** An action that opens the pin's watchapp with a launch code. */
export interface OpenWatchAppPinAction {
  title: string;
  type: 'openWatchApp';
  launchCode: number;
}

/** An action that sends an HTTP request, as the pin guide describes it. */
export interface HttpPinAction {
  title: string;
  type: 'http';
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bodyText?: string;
  bodyJSON?: unknown;
  successText?: string;
  successIcon?: string;
  failureText?: string;
  failureIcon?: string;
}

/** One action on a pin or a notification. */
export type PinAction = PluginPinAction | OpenWatchAppPinAction | HttpPinAction;

/** A timeline pin, as the pin guide gives its JSON. */
export interface TimelinePin {
  /** Up to 64 characters, unique within the app. Inserting an id already there changes that pin. */
  id: string;
  /** When the event starts, as an ISO date and time. */
  time: string;
  /** How long the event runs, in minutes. */
  duration?: number;
  layout: PinLayout;
  createNotification?: PinNotification;
  updateNotification?: PinNotification;
  /** Up to 3. */
  reminders?: PinReminder[];
  actions?: PinAction[];
}

/**
 * How a pin call went. `ok` means the call was handed to the Pebble app, which drops a pin it refuses
 * without saying, so it does not mean the pin is on the watch.
 */
export interface PinResult {
  ok: boolean;
  /** Why the call was not handed over, as `failureReason` words it, or `TIMELINE_UNAVAILABLE`. */
  error?: string;
}

/** A notification shown on the watch straight away, with a pin's layout and actions. */
export interface PluginNotification {
  layout: PinLayout & { type: 'genericNotification' | 'commNotification' };
  actions?: PinAction[];
}

/** The reason a pin call gives on a Pebble app from before 1.18.0, whose plugins have no timeline calls. */
export const TIMELINE_UNAVAILABLE = 'TIMELINE_UNAVAILABLE';

/**
 * Runs one pin call, which may throw, reject, or hand back nothing, and answers how it went. Nothing it
 * does escapes, so a refused pin never ends the run that made it.
 */
async function settle(call: (() => unknown) | undefined): Promise<PinResult> {
  if (typeof call !== 'function') {
    return { ok: false, error: TIMELINE_UNAVAILABLE };
  }

  try {
    await call();

    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureReason(error) };
  }
}

/**
 * Hands a pin to the Pebble app, to put on the timeline or to change the one with its id. Call it
 * before answering the request, since the run ends once it is answered.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param pin The pin.
 * @return Whether the call was handed over, and the reason when it was not. A pin handed over can still be dropped, such as for want of `Timeline`. It never throws or rejects.
 */
export function insertPin(pebble: PluginPebble, pin: TimelinePin): Promise<PinResult> {
  const insert = pebble.insertTimelinePin;

  return settle(insert && (() => insert.call(pebble, pin)));
}

/**
 * Hands the Pebble app a pin id to take off the timeline. Call it before answering the request.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param id The id the pin was inserted with.
 * @return Whether the call was handed over, and the reason when it was not. An id the Pebble app does not know is dropped without a word. It never throws or rejects.
 */
export function deletePin(pebble: PluginPebble, id: string): Promise<PinResult> {
  const remove = pebble.deleteTimelinePin;

  return settle(remove && (() => remove.call(pebble, id)));
}

export default { insertPin, deletePin, TIMELINE_UNAVAILABLE };
