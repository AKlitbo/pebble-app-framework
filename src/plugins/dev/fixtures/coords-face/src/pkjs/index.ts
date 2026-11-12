import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import calendar from '../../../../../../ts/calendar/feature';
import clayConfig from './config';

// the same face as the plain fixture, showing coordinates, so its weather is started with withCoords
app.startPebbleApp({
  clayConfig,
  features: [weather.withCoords(() => ({})), calendar],
});
