/**
 * The page check fixture for a face with no settings page of its own.
 *
 * It passes an empty page and takes its weather from a Pebble app plugin alone, so the only rows the
 * page gets are the ones the weather feature adds: where the weather comes from, or how to turn
 * plugins on, and the supported plugins panel.
 */
import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';

app.startPebbleApp({
  clayConfig: [],
  features: [weather],
});
