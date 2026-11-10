/**
 * The page check fixture for a face that takes its calendar from a Pebble app plugin alone.
 *
 * Its settings page is the `face/` fixture's, iCal link and all. It declares no `CALENDAR_SOURCE`, as
 * a face listing `"calendar": ["plugin"]` has to, so the page check builds it the way the real build
 * would.
 */
import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import calendar from '../../../../../../ts/calendar/feature';
import clayConfig from '../../../face/src/pkjs/config';

app.startPebbleApp({
  clayConfig,
  features: [weather, calendar],
});
