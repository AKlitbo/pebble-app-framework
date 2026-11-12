/**
 * The page check fixture for a face that takes its stock quotes from a Pebble app plugin alone.
 *
 * Its settings page is the config builder's stock section, with its marks, so the narrowed page
 * leaves an anchor where the Data Source was and the stock notes land in the Stock Preferences card.
 * It declares no `STOCK_PROVIDER`, as a face listing `"stocks": ["plugin"]` has to, so the page check
 * builds it the way the real build would.
 */
import app from '../../../../../../ts/pkjs/app';
import stocks from '../../../../../../ts/stock/feature';
import buildConfig from '../../../../../../ts/pkjs/config-builder';

app.startPebbleApp({
  clayConfig: buildConfig({ stocks: {} }),
  features: [stocks],
});
