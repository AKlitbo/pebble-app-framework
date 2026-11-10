import app from '../../../../../../ts/pkjs/app';
import music from '../../../../../../ts/music/feature';
import phone from '../../../../../../ts/phone/feature';
import clayConfig from './config';

app.startPebbleApp({
  clayConfig,
  features: [music, phone],
});
