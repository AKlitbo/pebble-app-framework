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
import { request, cacheBust } from '../pkjs/request';
import { getConfig, readText, watchSettings } from '../pkjs/settings-store';
import type { Feature } from '../pkjs/feature';
import { askShouldFetch, createAsks, refetchAfterSave, slowTickShouldFetch } from '../pkjs/asks';
import { createRound, finishRound, shutOutRound, startRound } from '../pkjs/round';

/**
 * Starts the calendar feature for a face.
 *
 * @param context What the app shares: the face's message keys, its config defaults, the send queue,
 *   and the refetch delay after a settings save.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page.
 */
const calendar: Feature = ({ messageKeys, defaults, queueSend, refetchDelayMs }) => {
  const feedSetting = watchSettings(['CALENDAR_ICS_URL'], defaults);

  // which download is the current one. a URL change starts one while another is still out, and
  // the two can answer in any order, so only the newest reaches the watch. request() settles every
  // call within its watchdog, so a round always ends
  const state = createRound();

  // who asked lately, so a slow tick or a watch ask does not fetch what another just did
  const asks = createAsks();

  // the strip the watch holds, so an unchanged refresh skips the redundant BLE wake. forgotten on
  // ready and on a watch-initiated request so the watch always gets a fresh answer
  const sender = createDedupedSender(queueSend, 'Calendar');

  /** Reads the current iCal feed URL from the Clay config. */
  function calendarUrl(): string {
    const url = readText(getConfig().CALENDAR_ICS_URL, String(defaults.CALENDAR_ICS_URL || '')).trim();

    // a Subscribe link, such as an iCloud public calendar, starts webcal://, which is https to
    // every calendar app. the phone's request knows no such scheme and fails on it every time
    return url.replace(/^webcal:\/\//i, 'https://');
  }

  /** Sends the packed agenda to the watch, unless the watch holds it already. An empty list clears it. */
  function sendCalendar(events: CalendarEvent[]) {
    const bytes = wire.packCalendarStrip(events);
    if (!bytes) {
      return;
    }

    sender.push({ [messageKeys.CALENDAR_STRIP]: bytes });
  }

  /**
   * Fetches the iCal feed, parses it, and sends the packed strip to the watch. Skipped for faces
   * that do not declare the calendar key. With no URL set the watch gets an empty agenda instead,
   * so one left over from a removed feed does not stay behind. While a download is out, an unforced
   * call starts no second one, since the one out answers it. A forced call, for a changed URL, starts
   * its own anyway, and an answer that lands after it is dropped so an old feed cannot overwrite a new one.
   */
  function getCalendar(force?: boolean) {
    // a face that does not declare the strip key never shows a calendar so skip the fetch
    if (messageKeys.CALENDAR_STRIP === undefined) {
      return;
    }

    // a download already out answers an unforced call. a forced one, for a changed URL, takes
    // over, and the old download's answer is dropped when it lands
    const round = startRound(state, Boolean(force));
    if (round === null) {
      return;
    }

    const url = calendarUrl();
    if (!url) {
      // no feed means nothing to download, so the round ends here rather than holding the gate
      finishRound(state, round);
      sendCalendar([]);
      return;
    }

    // bust any HTTP cache the phone keeps for this GET: a unique query param makes every poll a
    // fresh URL so an edited event is not hidden behind a stale cached copy. Google ignores the
    // extra param and still serves the feed
    const bustedUrl = cacheBust(url, Date.now());

    console.log('Calendar: fetching feed');
    request(bustedUrl, (error, body) => {
      // a newer fetch is out or already answered, so this one says nothing current
      if (!finishRound(state, round)) {
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

      if (askShouldFetch(asks)) {
        getCalendar();
      }
    },

    message(payload) {
      if (payload[messageKeys.CALENDAR_REQUEST]) {
        sender.forget();

        if (askShouldFetch(asks)) {
          getCalendar();
        }
      }
    },

    // the watch asks on the refresh interval the wearer picked, so the phone only fills in on the
    // slow ticks it has not covered
    refresh(slow) {
      if (slow && slowTickShouldFetch(asks)) {
        getCalendar();
      }
    },

    configOpened() {
      feedSetting.opened();
    },

    configSaved() {
      // a changed iCal URL refetches straight away, so a new feed shows without waiting for the next poll
      if (feedSetting.changed()) {
        // a download still out for the old feed would land in the moment before the forced refetch
        // and push the old agenda to the watch, where it stays if the new feed's download fails.
        // shutting it out drops that answer
        shutOutRound(state);
        refetchAfterSave(asks, refetchDelayMs, () => getCalendar(true));
      }
    },
  };
};

export default calendar;
