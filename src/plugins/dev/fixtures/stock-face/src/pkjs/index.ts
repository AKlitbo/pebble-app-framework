/**
 * The page check fixture for a face with stocks.
 *
 * Its stock section is its own, laid out the way a face with stock controls of its own builds it: a
 * heading, a lead line, the Data Source select, a key row shown only for the providers that need a
 * key, and the tickers. None of it carries a mark, so the providers list narrows it by key alone.
 */
import app from '../../../../../../ts/pkjs/app';
import stocks from '../../../../../../ts/stock/feature';
import { heading, select } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const clayConfig: ClayConfigItem[] = [
  heading('Page Check Stocks'),
  {
    type: 'section',
    items: [
      heading('Stocks'),
      {
        type: 'text',
        defaultValue: 'Pick where your quotes come from.',
      },
      select('STOCK_PROVIDER', 'Data Source', [
        { label: 'Finnhub', value: 'finnhub' },
        { label: 'Yahoo', value: 'yahoo' },
        { label: 'Twelve Data', value: 'twelvedata' },
        { label: 'Alpha Vantage', value: 'alphavantage' },
      ], 'finnhub'),
      {
        type: 'input',
        messageKey: 'STOCK_API_KEY',
        label: 'API Key',
        visibleWhen: { key: 'STOCK_PROVIDER', in: ['finnhub', 'twelvedata', 'alphavantage'] },
        attributes: {
          maxlength: 64,
        },
      },
      {
        type: 'input',
        messageKey: 'STOCK_SYMBOLS',
        label: 'Tickers',
        attributes: {
          maxlength: 64,
        },
      },
    ],
  },
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

app.startPebbleApp({
  clayConfig,
  features: [stocks],
});
