// a plugin app the bundle spec builds. it reaches the framework's iCal reader, so the bundle has to
// carry ical.js, and it hands what it parsed back through a global the spec reads
import ical from '../../../../../../ts/calendar/ical';

const scope = globalThis as unknown as { feed: string; now: number; parsed?: unknown };

scope.parsed = ical.parseIcal(scope.feed, scope.now);
