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
 * - the window of today plus the next six days, and the sort, which are what the agenda draws. Both
 *   live in window.ts, so any calendar reader lands on the agenda the same way
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
import { plainDescription } from './description';
import { horizonFor, upcomingWindow } from './window';
import { SOURCE_LIMIT_MAX } from '../plugin-app/source-limit';

/**
 * One upcoming event. The watch shows its window, all-day flag, title, and place. `uid`, `calendar`,
 * the notes, and the free, tentative, and declined marks stay on the phone and never reach the watch.
 * Every occurrence of a repeating event shares one `uid`, so it is the `uid` and the start together
 * that pick out one meeting, and `calendar` names the calendar the event is from.
 */
export interface CalendarEvent {
  startEpoch: number;
  endEpoch: number;
  allDay: boolean;
  title: string;
  location: string;
  /** The feed's UID for the event. Only the iCal reader fills it, and only when the feed gives one. */
  uid?: string;
  /** The name of the calendar the event is from. Only the plugin reader fills it, from the calendar a plugin names. */
  calendar?: string;
  /**
   * The event's notes as plain text, up to 300 characters. The iCal reader fills it only when asked
   * to, and the plugin reader when an update carries one. Left off when there are none.
   */
  description?: string;
  /** True when the feed marks the event's time as free, with `TRANSP:TRANSPARENT`. Only the iCal reader fills it, when asked for marks, and only when true. */
  free?: boolean;
  /**
   * True when the feed marks the event `STATUS:TENTATIVE`, or the wearer answered Maybe by one of the
   * addresses the iCal reader was given. Only the iCal reader fills it, when asked for marks, and only
   * when true.
   */
  tentative?: boolean;
  /** True when the wearer declined the event, by one of the addresses the iCal reader was given. Only the iCal reader fills it, when asked for marks, and only when true. */
  declined?: boolean;
}

/** What `parseIcal` reads beyond what the agenda needs. */
export interface IcalOptions {
  /**
   * Set to read each event's `DESCRIPTION` into `description`. Left out, no event carries one, so a
   * reader that never sends the notes on does not hold them.
   */
  descriptions?: boolean;
  /**
   * Set to mark each event `free`, `tentative`, and `declined` where the feed says so. Left out, no
   * event carries a mark.
   */
  marks?: boolean;
  /**
   * The wearer's own email addresses, read with `marks`. An event that lists the wearer among its
   * attendees by one of them with `PARTSTAT=DECLINED` reads as `declined`, and one with
   * `PARTSTAT=TENTATIVE`, a Maybe, reads as `tentative`. A `PARTSTAT=ACCEPTED` by any of them wins,
   * so the event reads as neither, and otherwise a decline wins over a Maybe. Case and spaces at the
   * ends do not count.
   */
  wearerAddresses?: readonly string[];
  /**
   * The most events to keep, a whole number from 1 up, for a plugin that serves more than a watchface
   * shows. A count past `SOURCE_LIMIT_MAX`, the most a plugin can be asked for, keeps that many, and
   * anything else keeps 64.
   */
  maxEvents?: number;
}

/** The fields an occurrence takes from its VEVENT beyond its times and text, only the ones set. */
type EventExtras = Pick<CalendarEvent, 'description' | 'free' | 'tentative' | 'declined'>;

/** What one VEVENT says about itself beyond its times and text. */
interface BlockDetails {
  cancelled: boolean;
  extras: EventExtras;
  /** Whether one of the VEVENT's own `ATTENDEE` lines is the wearer's. A moved occurrence without one answers as its series did. */
  listsWearer: boolean;
  /** The wearer's own answer on its attendee lines, when it is one the marks read. */
  answer: WearerAnswer | null;
}

/** The wearer's answers to an invitation that the marks read. */
type WearerAnswer = 'DECLINED' | 'TENTATIVE';

/** Reads a VEVENT's details, once per VEVENT. */
type BlockReader = (block: ICAL.Component) => BlockDetails;

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;

// no watchface shows more than a handful of events, so a feed with a very busy rule stops here
// rather than building a list nothing will ever read. a plugin that serves more asks for more
const MAX_EVENTS = 64;

/**
 * The most events a parse keeps, and the most each repeating event's walk gathers, from the
 * `maxEvents` asked for. With no usable count both are 64. With one, the parse keeps that many but
 * each walk gathers up to `SOURCE_LIMIT_MAX`. A walk cut at the count would stop on the first few
 * occurrences it reached, and one of those can be an occurrence moved later in the week, which leaves
 * a sooner one out of the soonest few.
 */
function eventCaps(maxEvents: number | undefined): { keep: number; walk: number } {
  if (typeof maxEvents !== 'number' || !Number.isInteger(maxEvents) || maxEvents < 1) {
    return { keep: MAX_EVENTS, walk: MAX_EVENTS };
  }

  return { keep: Math.min(maxEvents, SOURCE_LIMIT_MAX), walk: SOURCE_LIMIT_MAX };
}

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
function toCalendarEvent(event: ICAL.Event, start: ICAL.Time, duration: number, extras: EventExtras): CalendarEvent {
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
    ...extras,
  };
}

/**
 * Marks a VEVENT's occurrences with its UID. It runs once per VEVENT on what the walk kept, rather than
 * per step, since a daily rule set up years ago walks thousands of steps to reach the window.
 */
function withUid(events: CalendarEvent[], uid: string | null | undefined): CalendarEvent[] {
  if (uid) {
    events.forEach((event) => {
      event.uid = uid;
    });
  }

  return events;
}

/** An email address in the one form two of them are compared in, without `mailto:`. */
function plainAddress(address: string): string {
  return address
    .trim()
    .replace(/^mailto:/i, '')
    .trim()
    .toLowerCase();
}

/**
 * Whether a list of `ATTENDEE` lines holds one of the wearer's addresses, and the answer the marks
 * read from them. A feed can list the wearer under two addresses with two answers. An accept on any
 * of them wins, since the wearer is going, and otherwise a decline wins over a Maybe.
 */
function wearerAnswer(attendees: ICAL.Property[], addresses: Set<string>): { listed: boolean; answer: WearerAnswer | null } {
  const states = new Set<string>();
  let listed = false;

  if (!addresses.size) {
    return { listed, answer: null };
  }

  for (const attendee of attendees) {
    const address = attendee.getFirstValue();

    if (typeof address !== 'string' || !addresses.has(plainAddress(address))) {
      continue;
    }

    const partstat = attendee.getParameter('partstat');
    const state = Array.isArray(partstat) ? partstat[0] : partstat;

    listed = true;
    states.add(typeof state === 'string' ? state.toUpperCase() : '');
  }

  if (states.has('ACCEPTED')) {
    return { listed, answer: null };
  }

  return { listed, answer: states.has('DECLINED') ? 'DECLINED' : states.has('TENTATIVE') ? 'TENTATIVE' : null };
}

/** An answer's mark, set only when it is true. */
function answerMark(answer: WearerAnswer | null): EventExtras {
  if (answer === 'DECLINED') {
    return { declined: true };
  }

  return answer === 'TENTATIVE' ? { tentative: true } : {};
}

/**
 * Reads what one VEVENT says about itself beyond its times and text.
 *
 * A cancelled VEVENT is one marked `STATUS:CANCELLED`. Outlook keeps a cancelled meeting in the feed
 * with this status rather than taking it out, and a single cancelled occurrence of a series can arrive
 * the same way, as an override carrying it. With `marks`, the same read of the status marks a
 * tentative one.
 */
function readBlock(block: ICAL.Component, descriptions: boolean, marks: boolean, addresses: Set<string>): BlockDetails {
  const status = block.getFirstPropertyValue('status');
  const upper = typeof status === 'string' ? status.toUpperCase() : '';
  const attendees = marks ? block.getAllProperties('attendee') : [];
  const wearer = marks ? wearerAnswer(attendees, addresses) : { listed: false, answer: null };
  const extras: EventExtras = {};

  if (descriptions) {
    const description = block.getFirstPropertyValue('description');
    const text = typeof description === 'string' ? plainDescription(description) : '';

    if (text) {
      extras.description = text;
    }
  }

  if (marks) {
    const transparency = block.getFirstPropertyValue('transp');

    if (typeof transparency === 'string' && transparency.toUpperCase() === 'TRANSPARENT') {
      extras.free = true;
    }

    if (upper === 'TENTATIVE') {
      extras.tentative = true;
    }

    Object.assign(extras, answerMark(wearer.answer));
  }

  return { cancelled: upper === 'CANCELLED', extras, listsWearer: wearer.listed, answer: wearer.answer };
}

/**
 * Makes the reader for one parse, which keeps each VEVENT's details once read. A repeating event with
 * something moved off it reads its VEVENT on every step of the walk, and a rule set up years ago walks
 * thousands of steps, so each VEVENT is read once rather than once a step.
 */
function blockReader(options: IcalOptions): BlockReader {
  const read = new Map<ICAL.Component, BlockDetails>();
  const descriptions = options.descriptions === true;
  const marks = options.marks === true;
  const addresses = new Set((options.wearerAddresses || []).map((address) => plainAddress(String(address))).filter((address) => address.length > 0));

  return (block) => {
    let details = read.get(block);

    if (!details) {
      details = readBlock(block, descriptions, marks, addresses);
      read.set(block, details);
    }

    return details;
  };
}

/**
 * The extras an occurrence carries, from the VEVENT it reads from. A moved occurrence whose own
 * `ATTENDEE` lines leave the wearer out, or that has none, says nothing about the wearer's answer, so
 * it keeps the wearer's answer to the series, a decline or a Maybe. One that lists the wearer answers
 * for itself, so only an answer given on the occurrence overrides the series. The event's own
 * `STATUS:TENTATIVE` is not an answer, so it never carries across.
 */
function occurrenceExtras(item: ICAL.Component, series: ICAL.Component, detailsOf: BlockReader): EventExtras {
  const own = detailsOf(item);
  const seriesAnswer = detailsOf(series).answer;

  if (item === series || own.listsWearer || !seriesAnswer) {
    return own.extras;
  }

  return { ...own.extras, ...answerMark(seriesAnswer) };
}

/**
 * One occurrence as the watch sees it, or null when the feed cancelled it.
 *
 * An occurrence the feed moved or renamed reads from its own VEVENT, with that VEVENT's own start,
 * length, notes, and status, rather than from the rule.
 */
function readOccurrence(event: ICAL.Event, time: ICAL.Time, duration: number, detailsOf: BlockReader): CalendarEvent | null {
  try {
    const details = event.getOccurrenceDetails(time);

    if (detailsOf(details.item.component).cancelled) {
      return null;
    }

    return toCalendarEvent(details.item, details.startDate, durationOf(details.item), occurrenceExtras(details.item.component, event.component, detailsOf));
  } catch (error) {
    return toCalendarEvent(event, time, duration, detailsOf(event.component).extras);
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
function occurrencesOf(event: ICAL.Event, now: number, horizon: number, detailsOf: BlockReader, cap: number): CalendarEvent[] {
  const duration = durationOf(event);
  const extras = detailsOf(event.component).extras;

  if (!event.isRecurring()) {
    return [toCalendarEvent(event, event.startDate, duration, extras)];
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
    const occurrence = moved.length ? readOccurrence(event, next, duration, detailsOf) : toCalendarEvent(event, next, duration, extras);

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

    if (out.length >= cap) {
      finished = true;
      break;
    }
  }

  if (!finished) {
    console.log('calendar: a repeating event ran out of steps before the window, so it is left off');
  }

  // an occurrence whose own slot the walk never reached can still have been moved into the window.
  // its slot can sit past the window, past where a full walk stopped, or on no slot the rule makes
  // any more, after the rule was edited. parseIcal drops the ones that were not moved in
  moved.forEach((id) => {
    const recurrenceId = exceptions[id].recurrenceId;
    const occurrence = walked.has(toEpoch(recurrenceId)) ? null : readOccurrence(event, recurrenceId, duration, detailsOf);

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
 * @param days How many days the window holds, today counted, as `horizonFor` takes them. Left out,
 * the window is the week. A rule's walk stops at the same day, so a weekly event past the week
 * still shows in a longer window.
 * @param options What to read beyond what the agenda needs, the notes and the free, tentative, and
 * declined marks, and how many events to keep. Left out or null, the events are exactly what the
 * agenda reads, with no notes or marks and at most 64 of them.
 * @return The upcoming events in the window, soonest first. An empty list means the feed read clean
 * with nothing coming up. Null means the text was not a calendar at all, such as an error page,
 * which says nothing about what is on.
 */
function parseIcal(text: string, nowEpoch?: number, days?: number, options: IcalOptions | null = {}): CalendarEvent[] | null {
  const now = nowEpoch || Math.floor(Date.now() / 1000);
  const detailsOf = blockReader(options || {});
  const caps = eventCaps((options || {}).maxEvents);
  // a rule's walk stops at the window's last second, and upcomingWindow is handed the same one
  const horizon = horizonFor(now, { days });

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
  const liveMasters = masters.filter((block) => !detailsOf(block).cancelled);
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

      events.push(...withUid(occurrencesOf(event, now, horizon, detailsOf, caps.walk), event.uid));
    } catch (error) {
      console.error('calendar: skipped an event it could not read', error);
    }
  });

  // an override whose rule is not in the feed still happens, so it reads as a plain event
  const knownUids = new Set(masters.map((block) => block.getFirstPropertyValue('uid')));

  overrides.forEach((block) => {
    if (knownUids.has(block.getFirstPropertyValue('uid')) || detailsOf(block).cancelled) {
      return;
    }

    try {
      const event = new ICAL.Event(block);

      events.push(...withUid([toCalendarEvent(event, event.startDate, durationOf(event), detailsOf(block).extras)], event.uid));
    } catch (error) {
      // unreadable, so skip it
    }
  });

  return upcomingWindow(events, now, horizon).slice(0, caps.keep);
}

export default { parseIcal };
