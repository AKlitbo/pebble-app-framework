/**
 * The stock feature's plugin mode, which plugin-sources/index hands the feature on a face built with
 * `PLUGIN_STOCKS`.
 *
 * The saved `STOCK_PROVIDER` picks the mode, and `plugin` subscribes rather than running provider
 * rounds. Each update goes out through the feature's own sender, and a watch ask resends the last one.
 * While the plugin is picked nothing calls a provider, so no quota and no ledger stamp is spent. The
 * page hook adds the plugin to the Data Source select and lists the stock plugins in the supported
 * plugins panel, and the seeded hook checks a choice the watch brings back after a reset. Whenever the
 * plugin is not picked, the feature's own rounds run through the controls it hands over.
 *
 * It lives here rather than in the feature so a face built without the define carries none of it.
 */

import { followPluginChoice, pluginOnly } from './driver';
import type { FollowOptions } from './driver';
import { pluginSourcePage, PLUGIN_VALUE } from './page';
import type { PluginSourceTexts } from './page';
import { STOCK_STANDARD } from './standard';
import noteComponent from './note-component';
import panelComponent from './panel-component';
import type { SourceEnvelope, StockPlugins } from './types';
import { getConfig, readValue, watchSettings } from '../pkjs/settings-store';
import { STOCK_FALLBACK } from '../pkjs/providers';
import type { FeatureHooks } from '../pkjs/feature';
import stockUtil from '../stock/util';
import type { StockQuote } from '../stock/util';

/** The setting that picks between a plugin and a provider. */
export const PROVIDER_KEYS = ['STOCK_PROVIDER'];

/** What the stock mapping hands its driver. */
export interface StockMapping {
  /** Turns one update into the quotes the strip shows. */
  fromUpdate(envelope: SourceEnvelope | null | undefined): StockQuote[];
  /** The properties the subscription asks for. */
  properties: string[];
  /** The status the strip shows for a subscription error code, or undefined for a code with none. */
  errorStatus(code: string | null | undefined): string | undefined;
  /** The page hook's wording. */
  texts: PluginSourceTexts;
}

/**
 * Makes the stocks' driver from its mapping.
 *
 * @param mapping The update reader, the properties, the error statuses, and the wording.
 * @return The driver plugin-sources/index hands the feature.
 */
export function createStockDriver(mapping: StockMapping): StockPlugins['driver'] {
  return ({ messageKeys, defaults, providers }, controls): FeatureHooks => {
    const only = pluginOnly(providers ? providers.stocks : undefined, PLUGIN_VALUE);

    // a save is told apart by which of these moved. the provider switches between the plugin and a
    // provider, and the rest only mean something to a provider round
    const providerSettings = watchSettings(PROVIDER_KEYS, defaults);
    const fetchSettings = watchSettings(controls.settingKeys.filter((key) => !PROVIDER_KEYS.includes(key)), defaults);

    /** Sends the one status quote an error code calls for, when it calls for one. */
    function sendStatusFor(code: string | null | undefined): void {
      const status = mapping.errorStatus(code);

      if (status !== undefined) {
        controls.send([stockUtil.status(status)]);
      }
    }

    /** Whether some settings pick the plugin. */
    function pickedIn(config: Record<string, unknown>): boolean {
      return String(readValue(config.STOCK_PROVIDER, defaults.STOCK_PROVIDER || STOCK_FALLBACK)).toLowerCase() === PLUGIN_VALUE;
    }

    // the update the watch was last handed, which a watch ask resends
    let shown: SourceEnvelope | null = null;

    // whether an update since the plugin was last picked held quotes
    let hadQuotes = false;

    /**
     * Sends an update's quotes, unless it holds none after one that did.
     *
     * Pebble's Stocks drops every ticker it could not fetch, so an offline phone answers with no
     * tickers at all. Sending that would clear the watch's list, so the watch keeps its last quotes
     * instead, as it does after a provider round that got no answer. The cost is that a wearer who
     * takes every ticker out of the plugin keeps the old quotes on the watch until the next launch,
     * which is rarer than a phone losing its signal and puts right on its own.
     */
    function sendUpdate(envelope: SourceEnvelope): void {
      const quotes = mapping.fromUpdate(envelope);

      if (!quotes.length && hadQuotes) {
        console.log('Plugin stocks: an update with no tickers after one with quotes, so the watch keeps its last quotes');
        return;
      }

      hadQuotes = hadQuotes || quotes.length > 0;
      shown = envelope;
      controls.send(quotes);
    }

    const choice = followPluginChoice({
      category: 'finance',
      item: 'stock',
      properties: mapping.properties,
      only,
      pickedIn,
      shutOut: controls.shutOut,
      onUpdate: sendUpdate,
      onError(error) {
        // with an update kept the strip on the watch still stands. with nothing kept it is out of date,
        // so the status goes out even after an earlier strip
        if (choice.subscription.latest() === null) {
          // the watch now shows the status, so the quotes it held are gone, and the first update after
          // the subscription comes back goes out even when it is empty
          shown = null;
          hadQuotes = false;
          sendStatusFor(error.code);
        }
      },
    });

    const { subscription } = choice;

    /**
     * Brings the subscription in line with the choice, and lets go of the plugin's quotes once it is
     * not picked. A provider fills the strip from then on, so the plugin's first update after the
     * wearer comes back goes out even when empty, and a watch ask never resends quotes from before.
     */
    function follow(how?: FollowOptions): boolean {
      const picked = choice.follow(how);

      if (!picked) {
        shown = null;
        hadQuotes = false;
      }

      return picked;
    }

    const hooks: FeatureHooks = {
      requests: ['STOCK_REQUEST'],

      ready() {
        controls.forget();

        // a subscription costs no quota and lasts the JS session, so it starts afresh on every ready
        // without the ask gate. starting ends the one before, so one stays running
        if (!follow({ restart: true })) {
          controls.askFetch();
        }
      },

      message(payload) {
        if (!payload[messageKeys.STOCK_REQUEST]) {
          return;
        }

        controls.forget();

        if (!follow()) {
          controls.askFetch();
          return;
        }

        // the plugin sends on every change, so an ask only resends the quotes the watch was last
        // handed. with no update kept it sends the status the saved error calls for, so a rebooted
        // watch shows why it has none
        if (shown && subscription.latest()) {
          controls.send(mapping.fromUpdate(shown));
        } else {
          sendStatusFor(subscription.state().lastError);
        }
      },

      refresh(slow) {
        if (!slow) {
          return;
        }

        // the plugin sends on every change, so the slow tick only brings back a subscription the phone
        // ended, such as one waiting on plugins to be turned back on, or starts one that never was
        if (!follow({ retry: true })) {
          controls.slowFetch();
        }
      },

      configOpened() {
        providerSettings.opened();
        fetchSettings.opened();

        // a wearer opening the settings may be setting up a plugin right now, so the quick retry gets
        // its whole window again while the plugin waits on one
        subscription.retrySoon();
      },

      configSaved() {
        // each watch is read so its snapshot is let go, whichever one decides. a plugin only face has
        // no provider choice, so whatever a save holds for it switches nothing
        const providerMoved = providerSettings.changed() && !only;
        const fetchMoved = fetchSettings.changed();

        // a save onto the plugin starts it unless something already has, such as the seed, and starts
        // one the phone ended again. a save off it stops a started one
        const picked = follow({ retry: true });

        // the key, the tickers, and the plan only feed a provider round, so they change nothing here
        if (picked) {
          subscription.retrySoon();
          return;
        }

        if (providerMoved || fetchMoved) {
          // a round still out for the old settings would land after the switch, and the strip and
          // stamps kept for them would hold the refetch at the gate, so both go
          controls.forgetFetched();
          controls.afterSave(() => {
            if (!choice.picked()) {
              controls.fetch(true);
            }
          });
        }
      },
    };

    // the note and the supported plugins panel the page hook's rows are drawn with, which the app
    // registers only for a page holding them
    hooks.components = [noteComponent, panelComponent];

    // a plugin only face has no select for the page hook to add the plugin to, so the page gets the
    // notes alone, and keeps no choice on the watch for the seed to check
    if (only) {
      hooks.page = (config) => pluginSourcePage(config, {
        category: 'finance',
        item: 'stock',
        rowKind: 'stocks',
        plugins: subscription.plugins(),
        messageKeys,
        state: subscription.state(),
        standard: STOCK_STANDARD,
        texts: mapping.texts,
        panel: true,
      });

      return hooks;
    }

    hooks.page = (config) => pluginSourcePage(config, {
      selectKey: 'STOCK_PROVIDER',
      category: 'finance',
      item: 'stock',
      plugins: subscription.plugins(),
      messageKeys,
      state: subscription.state(),
      standard: STOCK_STANDARD,
      texts: mapping.texts,
      panel: true,
      saved: readValue(getConfig().STOCK_PROVIDER, undefined),
    });

    /**
     * Checks a plugin choice the watch brought back after a reset.
     *
     * The phone's own saved choice, from before this seed, stands as it would on any other face. Only
     * a choice the watch brought back to a phone holding none is checked. A phone with the plugin calls
     * keeps it even when it lists nothing, since plugins switched off read the same as one removed, and
     * the page keeps a saved plugin with plugins off too. A Pebble app from before plugins can never
     * answer, so there the choice comes out and the page default reads. getConfig still reads the
     * settings from before the seed, since the seed saves after its hooks.
     */
    function fixRestoredChoice(config: Record<string, unknown>): void {
      if (getConfig().STOCK_PROVIDER !== undefined) {
        return;
      }

      const restored = String(readValue(config.STOCK_PROVIDER, '')).toLowerCase();

      if (restored === PLUGIN_VALUE && !choice.hasPluginCalls()) {
        delete config.STOCK_PROVIDER;
      }
    }

    hooks.seeded = (config) => {
      fixRestoredChoice(config);
      choice.seed(config);

      // the seed's settings are not saved yet, so the choice it brings back is read from them
      if (!only && !pickedIn(config)) {
        shown = null;
        hadQuotes = false;
      }
    };

    return hooks;
  };
}

export default { createStockDriver, PROVIDER_KEYS };
