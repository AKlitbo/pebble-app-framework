/**
 * The calendar agenda, as a feature a face opts into.
 *
 * Fetches the face's private iCal feed, reads the next few days out of it, and sends the packed agenda
 * to the watch. An empty calendar or a removed feed sends an empty agenda, so the watch clears what it
 * had. A face without the CALENDAR_STRIP key gets nothing from it, even when it opts in.
 */
import ical from './ical';
import type { CalendarEvent } from './ical';
import wire from '../pkjs/wire';
import { createDedupedSender } from '../pkjs/send-queue';
import { request } from '../pkjs/request';
import { getConfig, readValue } from '../pkjs/settings-store';
import type { Feature } from '../pkjs/feature';

/**
 * Starts the calendar feature for a face.
 *
 * @param context What the app shares: the face's message keys, its config defaults, the send queue,
 *   and the refetch delay after a settings save.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page.
 */
const calendar: Feature = ({ messageKeys, defaults, queueSend, refetchDelayMs }) => {
  let urlBeforeConfig: string | null = null;

  // counts fetches, so only the newest one reaches the watch. a tick, a watch request, and a URL
  // change can each start one while another is still out, and they can answer in any order
  let fetches = 0;

  // the strip the watch holds, so an unchanged refresh skips the redundant BLE wake. forgotten on
  // ready and on a watch-initiated request so the watch always gets a fresh answer
  const sender = createDedupedSender<number[]>(
    queueSend,
    (bytes) => ({ [messageKeys.CALENDAR_STRIP]: bytes }),
    wire.bytesEqual,
    'Calendar'
  );

  /** Reads the current iCal feed URL from the Clay config. */
  function calendarUrl(): string {
    return String(readValue(getConfig().CALENDAR_ICS_URL, defaults.CALENDAR_ICS_URL || '')).trim();
  }

  /** Sends the packed agenda to the watch, unless the watch holds it already. An empty list clears it. */
  function sendCalendar(events: CalendarEvent[]) {
    const bytes = wire.packCalendarStrip(events);
    if (!bytes) {
      return;
    }

    sender.push(bytes);
  }

  /**
   * Fetches the iCal feed, parses it, and sends the packed strip to the watch. Skipped for faces
   * that do not declare the calendar key. With no URL set the watch gets an empty agenda instead,
   * so one left over from a removed feed does not stay behind. An answer that lands after a newer
   * fetch started is dropped, so an old feed cannot overwrite a new one.
   */
  function getCalendar() {
    // a face that does not declare the strip key never shows a calendar so skip the fetch
    if (messageKeys.CALENDAR_STRIP === undefined) {
      return;
    }

    const myFetch = ++fetches;

    const url = calendarUrl();
    if (!url) {
      sendCalendar([]);
      return;
    }

    // bust any HTTP cache the phone keeps for this GET: a unique query param makes every poll a
    // fresh URL so an edited event is not hidden behind a stale cached copy. Google ignores the
    // extra param and still serves the feed
    const bustedUrl = url + (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();

    console.log('Calendar: fetching feed');
    request(bustedUrl, (error, body) => {
      // a newer fetch is out or already answered, so this one says nothing current
      if (myFetch !== fetches) {
        return;
      }

      if (error) {
        console.error('Calendar fetch failed: ' + error);
        return;
      }

      const events = ical.parseIcal(body as string);
      if (!events) {
        // an error page or a cut off body says nothing about the calendar, so the watch keeps the
        // agenda it has
        console.error('Calendar: the feed did not read as iCal');
        return;
      }

      console.log('Calendar: parsed ' + events.length + ' upcoming event(s)');
      if (events.length) {
        console.log('Calendar: next is "' + events[0].title + '" at ' + new Date(events[0].startEpoch * 1000).toString());
      }

      // an empty list still goes, since that is how the watch hears every event was deleted
      sendCalendar(events);
    });
  }

  return {
    requests: ['CALENDAR_REQUEST'],

    ready() {
      // clear the dedupe cache so a watch that just rebooted with an empty store gets a fresh send
      sender.forget();
      getCalendar();
    },

    message(payload) {
      if (payload[messageKeys.CALENDAR_REQUEST]) {
        sender.forget();
        getCalendar();
      }
    },

    // an agenda changes whenever the feed does, so the calendar refreshes on every tick
    refresh() {
      getCalendar();
    },

    configOpened() {
      urlBeforeConfig = calendarUrl();
    },

    configSaved() {
      const before = urlBeforeConfig;
      urlBeforeConfig = null;

      // a changed iCal URL refetches straight away, so a new feed shows without waiting for the next poll
      if (before !== calendarUrl()) {
        setTimeout(getCalendar, refetchDelayMs);
      }
    },
  };
};

export default calendar;
