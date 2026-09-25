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
// per day just reaching the window. this covers about twenty-seven years of that, but a rule that
// repeats more often runs out sooner. an hourly one set up about fourteen months ago, or a daily
// one at three times of day set up about nine years ago, spends every step on the past and shows
// nothing. the walk logs when that happens, so a missing series is not silent.
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

/**
 * Builds the flat record the wire packer wants out of one occurrence.
 *
 * An all-day occurrence ends on the wall clock's midnight after its last day, counted in days rather
 * than seconds. A day is 23 or 25 hours long when the clocks change, so 24 hours from the start would
 * run into the next day or stop short of the end of this one.
 */
function toCalendarEvent(event: ICAL.Event, start: ICAL.Time, duration: number): CalendarEvent {
  const startEpoch = toEpoch(start);
  let endEpoch = startEpoch + duration;
  if (start.isDate) {
    const end = start.clone();
    end.addDuration(event.duration.toSeconds() > 0 ? event.duration : ICAL.Duration.fromSeconds(DAY_SECONDS));
    endEpoch = toEpoch(end);
  }

  return {
    startEpoch,
    endEpoch,
    allDay: Boolean(event.startDate.isDate),
    title: event.summary || '(no title)',
    location: event.location || '',
  };
}

/**
 * Whether a VEVENT is marked cancelled. Outlook keeps a cancelled meeting in the feed with this
 * status rather than taking it out, and a single cancelled occurrence of a series can arrive the
 * same way, as an override carrying it.
 */
function isCancelled(block: ICAL.Component): boolean {
  const status = block.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

/**
 * One occurrence as the watch sees it, or null when the feed cancelled it.
 *
 * An occurrence the feed moved or renamed reads from its own VEVENT, with that VEVENT's own start
 * and length, rather than from the rule.
 */
function readOccurrence(event: ICAL.Event, time: ICAL.Time, duration: number): CalendarEvent | null {
  try {
    const details = event.getOccurrenceDetails(time);
    if (isCancelled(details.item.component)) {
      return null;
    }
    return toCalendarEvent(details.item, details.startDate, durationOf(details.item));
  } catch (error) {
    return toCalendarEvent(event, time, duration);
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
    return [toCalendarEvent(event, event.startDate, duration)];
  }

  // ical.js types this as a list, but it is keyed by the recurrence id of the occurrence it replaces
  const exceptions = event.exceptions as unknown as Record<string, ICAL.Event>;
  const moved = Object.keys(exceptions);

  const out: CalendarEvent[] = [];
  const iterator = event.iterator();
  let finished = false;
  // the slots the walk reached, kept only for a rule with something moved off it
  const walked = new Set<number>();

  for (let step = 0; step < MAX_STEPS && !finished; step++) {
    const next = iterator.next();
    if (!next) {
      finished = true;
      break;
    }

    // breaking the time apart allocates, and a daily rule set up years ago walks thousands of
    // steps before it reaches the window, so the step is measured once and read twice
    const startEpoch = toEpoch(next);

    // the rule hands its times back in order, so the first one past the window ends the walk
    if (startEpoch > horizon) {
      finished = true;
      break;
    }

    if (moved.length) {
      walked.add(startEpoch);
    }

    // a rule with nothing moved off it skips the lookup, for the same reason the walk is long. a rule
    // with anything moved looks every step up, since ical.js matches a moved occurrence by its own
    // time, by its UTC time, or through a range that moves every later one. checking first would
    // cost the same two time conversions the lookup makes, and could miss a range
    const occurrence = moved.length ? readOccurrence(event, next, duration) : toCalendarEvent(event, next, duration);

    // cancelled on its own, so the series has a gap here
    if (!occurrence) {
      continue;
    }

    // already over, but the walk carries on because the ones behind it may not be
    if (occurrence.endEpoch < now) {
      continue;
    }

    // full, but the pass below still runs, since an occurrence moved in from past the window can
    // be sooner than most of these
    out.push(occurrence);
    if (out.length >= MAX_EVENTS) {
      finished = true;
      break;
    }
  }

  if (!finished) {
    console.log('calendar: a repeating event ran out of steps before this week, so it is left off');
  }

  // an occurrence whose own slot the walk never reached can still have been moved into the window.
  // its slot can sit past the window, past where a full walk stopped, or on no slot the rule makes
  // any more, after the rule was edited. parseIcal drops the ones that were not moved in
  moved.forEach((id) => {
    const recurrenceId = exceptions[id].recurrenceId;
    const occurrence = walked.has(toEpoch(recurrenceId)) ? null : readOccurrence(event, recurrenceId, duration);
    if (occurrence) {
      out.push(occurrence);
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
 * @return The upcoming events in the window, soonest first. An empty list means the feed read clean
 * with nothing coming up. Null means the text was not a calendar at all, such as an error page,
 * which says nothing about what is on.
 */
function parseIcal(text: string, nowEpoch?: number): CalendarEvent[] | null {
  const now = nowEpoch || Math.floor(Date.now() / 1000);
  // the window runs to the end of the sixth day ahead on the phone's clock, the last second before
  // that day's midnight. six days on from now would cut the last day at whatever time the feed
  // was fetched, keeping a morning event on it and dropping an evening one
  const end = new Date(now * 1000);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + LOOKAHEAD_DAYS + 1);
  const horizon = Math.floor(end.getTime() / 1000) - 1;

  let root: ICAL.Component;
  try {
    const jcal = ICAL.parse(String(text || ''));
    // a component is [name, properties, subcomponents]. an empty body parses to a bare [], which
    // builds a Component happily and only throws once something is read off it. that is no calendar
    // at all, so the shape is checked here rather than left to surface deeper in
    if (!Array.isArray(jcal) || jcal.length < 3) {
      return null;
    }
    root = new ICAL.Component(jcal);
  } catch (error) {
    // the feed is not iCal at all. a fetch can hand back an error page or a truncated body, which
    // says nothing about the calendar, so it must not read as one with nothing on
    console.log('calendar: could not read the feed');
    return null;
  }

  // a VEVENT carrying RECURRENCE-ID is one occurrence of another event rather than an event of
  // its own, so it rides along with the rule it belongs to instead of being read on its own
  const blocks = root.getAllSubcomponents('vevent');
  const masters = blocks.filter((block) => !block.hasProperty('recurrence-id'));
  const liveMasters = masters.filter((block) => !isCancelled(block));
  const overrides = blocks.filter((block) => block.hasProperty('recurrence-id'));

  // the moved occurrences grouped by UID once, so each rule finds its own without walking every
  // override in the feed. a feed of busy recurring meetings would otherwise take one full walk per rule
  const overridesByUid = new Map<unknown, ICAL.Component[]>();
  overrides.forEach((block) => {
    const uid = block.getFirstPropertyValue('uid');
    const group = overridesByUid.get(uid);
    if (group) {
      group.push(block);
    } else {
      overridesByUid.set(uid, [block]);
    }
  });

  // a cancelled event is kept in the feed rather than taken out, so it is left off the agenda here.
  // its overrides still go by its UID below, so a cancelled series does not come back as loose ones
  const events: CalendarEvent[] = [];
  liveMasters.forEach((block) => {
    // each rule gets only the moved occurrences carrying its own UID, passed in by hand. left to
    // itself ical.js hands every RECURRENCE-ID in the calendar to every rule without checking the
    // UID, so one moved meeting would replace a slot in every other series at the same time
    const own = overridesByUid.get(block.getFirstPropertyValue('uid')) || [];

    // ical.js throws on a rule it cannot walk, such as BYMONTHDAY on a weekly rule, and on an event
    // with no start. one unreadable event is not worth losing the others over
    try {
      const event = new ICAL.Event(block, { exceptions: own });
      events.push(...occurrencesOf(event, now, horizon));
    } catch (error) {
      console.error('calendar: skipped an event it could not read', error);
    }
  });

  // an override whose rule is not in the feed still happens, so it reads as a plain event
  const knownUids = new Set(masters.map((block) => block.getFirstPropertyValue('uid')));
  overrides.forEach((block) => {
    if (knownUids.has(block.getFirstPropertyValue('uid')) || isCancelled(block)) {
      return;
    }
    try {
      const event = new ICAL.Event(block);
      events.push(toCalendarEvent(event, event.startDate, durationOf(event)));
    } catch (error) {
      // unreadable, so skip it
    }
  });

  // keep an event while it has not finished and its start is inside the window. testing
  // against endEpoch means an in-progress meeting still counts as current
  const kept = events.filter((event) => event.endEpoch >= now && event.startEpoch <= horizon);

  kept.sort((left, right) => left.startEpoch - right.startEpoch);
  return kept.slice(0, MAX_EVENTS);
}

export default { parseIcal };
