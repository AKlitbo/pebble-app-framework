/**
 * The page check fixture for a face that takes its weather from a Pebble app plugin alone.
 *
 * Its settings page is the `face/` fixture's, Data Source select and all, since a face built with the
 * config builder gets that select whatever it lists. It declares no `WEATHER_PROVIDER`, as a face
 * listing `"weather": ["plugin"]` has to, so the page check builds it the way the real build would.
 */
import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import calendar from '../../../../../../ts/calendar/feature';
import clayConfig from '../../../face/src/pkjs/config';

app.startPebbleApp({
  clayConfig,
  features: [weather, calendar],
});
