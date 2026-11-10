/**
 * A plugin app's settings page code: it loads the saved settings from the plugin and saves them back.
 *
 * A plugin app's settings page is a Clay page bundled into the pbw. The page's own storage is not the
 * plugin's, so it cannot keep its settings itself, and Clay's own Save goes to the PebbleKit JS path a
 * plugin does not have. So once the plugin says it is ready, this asks it for the saved settings and
 * sets each row. On Save it stops Clay's own submit, sends every setting to the plugin, and closes the
 * page only once the plugin has answered.
 *
 * Save waits for the saved settings to load, since a page still on its defaults would save them over
 * the wearer's, and a load only counts when the plugin answers with its settings. A save only closes
 * the page when the plugin answers that it kept them. One that fails leaves the page open with the
 * reason in the status row, and a load or a save the plugin has not answered after five seconds says
 * so. The phone's back button closes the page without saving, which is how a wearer drops a change.
 *
 * The build puts a status row with the id `paf-save-status` above the Save button, and points Clay's own
 * return address at an in-page hash, so Clay's submit can never close the page with the settings unsaved.
 *
 * Clay writes this into the page as text and runs it there, so it reaches nothing outside itself: no
 * imports and no module-scope constants. It spells the two message types out, and they match the
 * plugin side's LOAD_MESSAGE and SAVE_MESSAGE in settings.ts.
 */

/** The bits of a Clay row this reaches. */
interface PageRow {
  set(value: unknown): void;
}

/** The bits of the Clay config page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  on(event: string, handler: () => void): void;
  getItemById(id: string): PageRow | undefined;
  getItemByMessageKey(messageKey: string): PageRow | undefined;
  serialize(): Record<string, { value: unknown }>;
}

/** The page's bridge to the plugin, as the Pebble app gives a settings page. */
interface PageBridge {
  addEventListener(name: string, listener: (event: { target: string }) => void): void;
  sendMessage(target: string, message: unknown): Promise<unknown>;
}

/** The plugin app settings page code Clay runs with the page as `this`. */
export default function pluginSettingsPage(this: ClayPage): void {
  // arrows rather than a this alias, so the handlers reach the page without carrying a copy
  const bridge = (window as unknown as { Pebble?: PageBridge }).Pebble;
  let loaded = false;
  let loadAnswered = false;
  let saving = false;

  // the save the page is waiting on. a reply or a timeout from an older one has nothing to say about it
  let latestSave = 0;

  // the status row is a Clay text row, which sets its text as HTML, so a reason that quotes a feed or
  // a link shows as written rather than as markup
  const say = (text: string): void => {
    const row = this.getItemById('paf-save-status');

    if (row) {
      row.set(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    }
  };

  const reason = (reply: unknown): string | null => {
    const error = typeof reply === 'object' && reply !== null ? (reply as { error?: unknown }).error : undefined;

    return error ? String(error) : null;
  };

  if (!bridge || typeof bridge.sendMessage !== 'function') {
    this.on(this.EVENTS.AFTER_BUILD, () => say('Open this page from the Pebble app to change these settings.'));
    return;
  }

  this.on(this.EVENTS.AFTER_BUILD, () => {
    // only a load nothing has answered gets this, so a quick failure keeps its own reason on the row
    setTimeout(() => {
      if (!loadAnswered) {
        say('The plugin has not answered after five seconds, so saving is off. Go back and open the page again.');
      }
    }, 5000);

    bridge.addEventListener('ready', (event) => {
      if (event.target !== 'plugin') {
        return;
      }

      bridge.sendMessage('plugin', { type: 'paf-settings-load' }).then((reply) => {
        const failed = reason(reply);

        loadAnswered = true;
        const saved = typeof reply === 'object' && reply !== null ? (reply as { settings?: unknown }).settings : undefined;

        if (failed || typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
          say('Could not load the saved settings, so saving is off: ' + (failed || 'the plugin sent none'));
          return;
        }

        Object.keys(saved).forEach((key) => {
          const row = this.getItemByMessageKey(key);
          const value = (saved as Record<string, unknown>)[key];

          if (row && value !== undefined && value !== null) {
            row.set(value);
          }
        });
        loaded = true;

        // a load that lands after the five seconds takes back the warning that saving is off
        say('');
      }).catch((error) => {
        loadAnswered = true;
        say('Could not load the saved settings, so saving is off: ' + error);
      });
    });
  });

  const save = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (saving) {
      return;
    }

    if (!loaded) {
      say('The saved settings have not loaded, so saving now would replace them. Go back and open the page again.');
      return;
    }

    saving = true;
    say('Saving...');

    const attempt = ++latestSave;

    const serialized = this.serialize();
    const settings: Record<string, unknown> = {};
    let answered = false;

    Object.keys(serialized).forEach((key) => {
      settings[key] = serialized[key].value;
    });

    setTimeout(() => {
      if (!answered && attempt === latestSave) {
        saving = false;
        say('The plugin has not answered after five seconds. Tap Save to try again.');
      }
    }, 5000);

    bridge.sendMessage('plugin', { type: 'paf-settings-save', settings: settings }).then((reply) => {
      answered = true;

      if (attempt !== latestSave) {
        return;
      }

      const kept = typeof reply === 'object' && reply !== null && (reply as { ok?: unknown }).ok === true;

      if (!kept) {
        saving = false;
        say('Could not save: ' + (reason(reply) || 'the plugin did not say it kept them'));
        return;
      }

      window.location.href = 'pebblejs://close';
    }).catch((error) => {
      answered = true;

      if (attempt !== latestSave) {
        return;
      }

      saving = false;
      say('Could not save: ' + error);
    });
  };

  // caught before Clay's own submit handler and before the form submits, since a web view can reload
  // the page on a submit before anything is sent
  window.addEventListener('submit', save, true);
  window.addEventListener('click', (event) => {
    const target = event.target as { type?: string } | null;

    if (target && target.type === 'submit') {
      save(event);
    }
  }, true);
}
