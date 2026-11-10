/**
 * The page check fixture for a face with no temperature unit that takes its weather from a Pebble app
 * plugin alone.
 *
 * Its settings page is the `no-unit-face/` fixture's. It declares no `WEATHER_PROVIDER`, as a face
 * listing `"weather": ["plugin"]` has to.
 */
import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import clayConfig from '../../../no-unit-face/src/pkjs/config';

app.startPebbleApp({
  clayConfig,
  features: [weather],
});
