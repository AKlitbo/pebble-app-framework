/**
 * The calendar hub's reader for a private .ics feed (a Google secret address, an Outlook
 * published URL).
 *
 * The reading itself is ical.js, which ships as its own file (see icaljs.d.ts for how, and
 * NOTICES.md for its licence). This file is the seam: it hands ical.js the feed, asks it for the
 * occurrences inside the window the watch shows, and turns them into the small flat records the
 * wire packer wants. Everything about RFC 5545 lives on the far side of that seam, which is the
 * point.
 *
 * What the seam still owns, because they are ours and not the RFC's:
 *
 * - the six day window and the sort, which are what the agenda draws
 * - a timed event with no stated end, which we give an hour so free/busy has a cell to shade
 * - the cap, so a feed with a busy rule cannot build a list nothing will read
 *
 * A note on zones, since it is the whole reason a meeting reads right from another continent. A
 * feed states a timed event in a named zone and defines that name in a VTIMEZONE block of its
 * own, and ical.js resolves one against the other by itself as long as both are read from the
 * same VCALENDAR. So a name the phone has never heard of (Outlook sends "Eastern Standard Time",
 * not "America/New_York") needs no zone table and nothing registered here.
 *
 * ical.js carries no zone database of its own, so a name it is never given a definition for has
 * no answer and the time floats on the phone's clock. The rules say a feed must define what it
 * names and the big ones do, so that is a malformed feed rather than something to work around
 * here.
 */

import ICAL from './icaljs';

/** One upcoming event the watch shows: its window, all-day flag, title, and place. */
export interface CalendarEvent {
  startEpoch: number;
  endEpoch: number;
  allDay: boolean;
  title: string;
  location: string;
}

// how far ahead we care about: one week so the agenda's two-letter day codes never repeat a
// weekday (today plus the next six days). events past this are dropped
const LOOKAHEAD_DAYS = 6;

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;

// no watchface shows more than a handful of events, so a feed with a very busy rule stops here
// rather than building a list nothing will ever read
const MAX_EVENTS = 64;

// a rule is walked from its very first occurrence, so a daily one set up years ago spends a step
// per day just reaching the window. this covers about twenty-seven years of that and is only
// reached by a rule shaped so the window never arrives.
//
// ical.js can be asked to start the walk near the window instead, which would make this tiny, but
// it loses COUNT on the way: a COUNT=3 rule that ran out in January hands back three occurrences
// in July. so the walk starts where the rule does and this is what keeps it bounded
const MAX_STEPS = 10000;

/** Seconds since the epoch for an ical.js time. */
function toEpoch(time: ICAL.Time): number {
  return Math.floor(time.toJSDate().getTime() / 1000);
}

/**
 * How long one occurrence runs.
 *
 * An event carrying neither an end nor a duration is a point in time to ical.js, but the panels
 * shade a block, so a timed one gets an hour. An all-day one already reads as a whole day.
 */
function durationOf(event: ICAL.Event): number {
  const seconds = event.duration.toSeconds();
  if (seconds > 0) {
    return seconds;
  }
  return event.startDate.isDate ? DAY_SECONDS : HOUR_SECONDS;
}

/** Builds the flat record the wire packer wants out of one occurrence. */
function toCalendarEvent(event: ICAL.Event, startEpoch: number, duration: number): CalendarEvent {
  return {
    startEpoch,
    endEpoch: startEpoch + duration,
    allDay: Boolean(event.startDate.isDate),
    title: event.summary || '(no title)',
    location: event.location || '',
  };
}

/**
 * One occurrence as the watch sees it.
 *
 * An occurrence the feed moved or renamed reads from its own VEVENT, with that VEVENT's own start
 * and length, rather than from the rule.
 */
function readOccurrence(event: ICAL.Event, time: ICAL.Time, duration: number): CalendarEvent {
  try {
    const details = event.getOccurrenceDetails(time);
    return toCalendarEvent(details.item, toEpoch(details.startDate), durationOf(details.item));
  } catch (error) {
    return toCalendarEvent(event, toEpoch(time), duration);
  }
}

/**
 * Every occurrence of one event that lands in the window.
 *
 * A plain event is just itself. A repeating one gets walked, and ical.js folds in whatever the
 * feed said about it: the days EXDATE cancelled, and the single occurrences a RECURRENCE-ID
 * VEVENT moved or renamed.
 *
 * The walk steps through the rule's own times, but a moved occurrence is judged on where it
 * landed. One moved from the past to later in the week is still to come, and one moved into the
 * week from further out still shows.
 */
function occurrencesOf(event: ICAL.Event, now: number, horizon: number): CalendarEvent[] {
  const duration = durationOf(event);

  if (!event.isRecurring()) {
    return [toCalendarEvent(event, toEpoch(event.startDate), duration)];
  }

  // ical.js types this as a list, but it is keyed by the recurrence id of the occurrence it replaces
  const exceptions = event.exceptions as unknown as Record<string, ICAL.Event>;
  const moved = Object.keys(exceptions);

  const out: CalendarEvent[] = [];
  const iterator = event.iterator();

  for (let step = 0; step < MAX_STEPS; step++) {
    const next = iterator.next();
    if (!next) {
      break;
    }

    // the rule hands its times back in order, so the first one past the window ends the walk
    if (toEpoch(next) > horizon) {
      break;
    }

    // a rule with nothing moved off it skips the lookup, since a daily one set up years ago walks
    // thousands of steps before it reaches the window
    const occurrence = moved.length ? readOccurrence(event, next, duration) : toCalendarEvent(event, toEpoch(next), duration);

    // already over, but the walk carries on because the ones behind it may not be
    if (occurrence.endEpoch < now) {
      continue;
    }

    out.push(occurrence);
    if (out.length >= MAX_EVENTS) {
      return out;
    }
  }

  // an occurrence whose own slot sits past the window never came up in the walk, but it can have
  // been moved into the window. parseIcal drops the ones that were not
  moved.forEach((id) => {
    const recurrenceId = exceptions[id].recurrenceId;
    if (toEpoch(recurrenceId) > horizon) {
      out.push(readOccurrence(event, recurrenceId, duration));
    }
  });

  return out;
}

/**
 * Parses a .ics feed into upcoming events, soonest first.
 *
 * @param text The feed's raw .ics text.
 * @param nowEpoch The instant to treat as now, as epoch seconds. Injectable so tests stay
 * deterministic. Defaults to the real now.
 * @return The upcoming events in the window, soonest first.
 */
function parseIcal(text: string, nowEpoch?: number): CalendarEvent[] {
  const now = nowEpoch || Math.floor(Date.now() / 1000);
  const horizon = now + LOOKAHEAD_DAYS * DAY_SECONDS;

  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(String(text || ''));
    // a component is [name, properties, subcomponents]. an empty feed parses to a bare [], which
    // builds a Component happily and only throws once something is read off it, so the shape is
    // checked here rather than left to surface deeper in
    if (!Array.isArray(jcal) || jcal.length < 3) {
      return [];
    }
    root = new ICAL.Component(jcal);
  } catch (error) {
    // the feed is not iCal at all. a fetch can hand back an error page or a truncated body, and
    // the panels read an empty list as "nothing on", which beats taking the app down
    console.log('calendar: could not read the feed');
    return [];
  }

  // a VEVENT carrying RECURRENCE-ID is one occurrence of another event rather than an event of
  // its own, so it rides along with the rule it belongs to instead of being read on its own
  const blocks = root.getAllSubcomponents('vevent');
  const masters = blocks.filter((block) => !block.hasProperty('recurrence-id'));
  const overrides = blocks.filter((block) => block.hasProperty('recurrence-id'));

  let events: CalendarEvent[] = [];
  masters.forEach((block) => {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(block);
    } catch (error) {
      return; // one unreadable event is not worth losing the others over
    }

    overrides.forEach((override) => {
      try {
        event.relateException(override);
      } catch (error) {
        // the override belongs to a different event, which is the normal case
      }
    });

    events = events.concat(occurrencesOf(event, now, horizon));
  });

  // an override whose rule is not in the feed still happens, so it reads as a plain event
  const knownUids = masters.map((block) => block.getFirstPropertyValue('uid'));
  overrides.forEach((block) => {
    if (knownUids.indexOf(block.getFirstPropertyValue('uid')) !== -1) {
      return;
    }
    try {
      const event = new ICAL.Event(block);
      events.push(toCalendarEvent(event, toEpoch(event.startDate), durationOf(event)));
    } catch (error) {
      // unreadable, so skip it
    }
  });

  // keep an event while it has not finished and its start is inside the window. testing
  // against endEpoch means an in-progress meeting still counts as current
  events = events.filter((event) => event.endEpoch >= now && event.startEpoch <= horizon);

  events.sort((left, right) => left.startEpoch - right.startEpoch);
  return events.slice(0, MAX_EVENTS);
}

export default { parseIcal };
