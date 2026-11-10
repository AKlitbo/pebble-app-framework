import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import clayConfig from './config';

app.startPebbleApp({
  clayConfig,
  features: [weather],
});
