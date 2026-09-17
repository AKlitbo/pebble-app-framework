/**
 * Clay custom component for live location autocomplete.
 *
 * As the user types, it queries Open-Meteo's free geocoding API and shows
 * matching places. Selecting one stores the resolved coordinates so the watch
 * never has to geocode.
 *
 * Persisted value:
 *   JSON string {lat, lon, label, offset, tz}
 *
 * `tz` is the IANA zone the geocoder named, such as Europe/London, and `offset` is how far ahead of
 * UTC that zone was when the place was picked. A timezone field is sent to the watch as
 * "offset,label" by the pkjs side, which reads the offset off the zone each time so it follows a
 * daylight saving switch.
 *
 * IMPORTANT: `initialize` and the `manipulator` methods are serialised
 * (via .toString()) and run inside the Clay config webview, a separate JS
 * context. They must be self-contained and must NOT reference anything from
 * this module's scope (module-level constants, imports, etc.). Those are
 * undefined in the webview and will throw. Keep such values inline.
 */

/** The Clay component context the manipulator and initialize bind to. */
export interface ClayComponentContext {
  $element: HTMLElement[];
  config: { label?: string; description?: string; messageKey?: string; attributes?: { placeholder?: string } };
}

/** One Open-Meteo geocoding result the autocomplete list shows. */
interface GeoPlace {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export default {
  /** The component type name, matched by a Clay config item's own `type: 'locationsearch'`. */
  name: 'locationsearch',

  /** The markup this component renders for its config row. */
  template: [
    '<div class="component component-input loc-search">',
    '  <label class="tap-highlight">',
    '    <span class="label loc-label"></span>',
    '    <span class="input">',
    '      <input type="text" class="loc-query" autocomplete="off" autocorrect="off" autocapitalize="words">',
    '      <ul class="loc-list"></ul>',
    '    </span>',
    '  </label>',
    '  <div class="description" style="display:none;"></div>',
    '  <div class="loc-note" style="display:none;">Pick this city again so its clock follows daylight saving.</div>',
    '  <input type="hidden" class="loc-value">',
    '</div>',
  ].join(''),

  /** The CSS this component needs, scoped to its own class names. */
  style: [
    '.loc-search .input { position: relative; }',
    '.loc-search .loc-list { position: absolute; left: 0; right: 0; top: 100%; z-index: 10; list-style: none; margin: 0; padding: 0; background: #fff; color: #000; border: 1px solid #ccc; border-radius: 0 0 4px 4px; max-height: 180px; overflow-y: auto; }',
    '.loc-search .loc-list:not(.show) { display: none; }',
    '.loc-search .loc-item { padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; }',
    '.loc-search .loc-item:last-child { border-bottom: none; }',
    '.loc-search .loc-item:hover, .loc-search .loc-item:active { background: #ff4700; color: #fff; }',
    '.loc-search .loc-note { padding: 0.5rem 0 0; font-size: 0.9em; color: #ff4700; }',
  ].join(''),

  manipulator: {
    /**
     * Restores a saved selection: shows the place label and keeps the raw stored value.
     *
     * A timezone field also gets told when what it restored carries no zone, since that is the one
     * thing the user has to act on and the picker is where they would act.
     *
     * @param value The persisted string Clay hands back, the saved place as JSON, or "offset,label"
     * for a timezone saved before the zone was kept, or empty when nothing is saved yet.
     */
    set: function(this: ClayComponentContext, value: string) {
      const root = this.$element[0];
      let label = '';
      let zone = '';

      (root.querySelector('.loc-value') as HTMLInputElement).value = value || '';

      if (value) {
        try {
          const parsed = JSON.parse(value);
          if (parsed && parsed.label) {
            label = parsed.label;
          }
          if (parsed && typeof parsed.tz === 'string') {
            zone = parsed.tz;
          }
        } catch (error) {
          // a place saved before the zone was kept round-trips as offset then label, so show just
          // the label. anything else is corrupt so leave the box empty
          if (typeof value === 'string' && value !== '0') {
            const commaIndex = value.indexOf(',');
            if (commaIndex !== -1) {
              label = value.substring(commaIndex + 1);
            }
          }
        }
      }

      (root.querySelector('.loc-query') as HTMLInputElement).value = label;

      // a timezone field reads its offset off the zone, so a place saved without one is stuck on
      // whatever the offset was the day it was picked and goes an hour out when the clocks change.
      // picking the place again is the whole fix, and it happens right here
      const messageKey = this.config.messageKey || '';
      const wantsZone = /TIME_?ZONE/i.test(messageKey);
      const noteEl = root.querySelector('.loc-note') as HTMLElement;
      noteEl.style.display = (wantsZone && label && !zone) ? 'block' : 'none';
    },

    /**
     * Returns the value to persist, which is the saved place as JSON for every kind of key.
     *
     * A timezone field reaches the watch as "offset,label". The pkjs side builds that from the
     * saved zone on the way out, which is what keeps the offset right across a daylight saving
     * switch, so the zone has to survive being persisted here.
     *
     * @return The string Clay should persist, or an empty string when nothing is picked yet.
     */
    get: function(this: ClayComponentContext) {
      return (this.$element[0].querySelector('.loc-value') as HTMLInputElement).value || '';
    },
  },

  /**
   * Wires up the live autocomplete: a debounced geocoder query, a results
   * dropdown, and persisting the chosen place's coordinates (plus offset).
   */
  initialize: function(this: ClayComponentContext) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const root = self.$element[0];

    const queryEl = root.querySelector('.loc-query') as HTMLInputElement;
    const hiddenEl = root.querySelector('.loc-value') as HTMLInputElement;
    const listEl = root.querySelector('.loc-list') as HTMLElement;
    const noteEl = root.querySelector('.loc-note') as HTMLElement;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seq = 0;

    (root.querySelector('.loc-label') as HTMLElement).textContent = self.config.label || 'Location';
    if (self.config.attributes && self.config.attributes.placeholder) {
      queryEl.placeholder = self.config.attributes.placeholder;
    }
    if (self.config.description) {
      const descEl = root.querySelector('.description') as HTMLElement;
      descEl.textContent = self.config.description;
      descEl.style.display = 'block';
    }

    /** Joins a place's name, region, and country into one label, dropping missing parts. */
    function labelFor(place: GeoPlace) {
      return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    }

    /** Clears and hides the suggestions dropdown. */
    function hideList() {
      while (listEl.firstChild) {
        listEl.removeChild(listEl.firstChild);
      }
      listEl.classList.remove('show');
    }

    /**
     * Looks up the selected place's zone and its offset today, and stores both alongside the
     * coordinates. The zone is the half that lasts, since the pkjs side reads the offset off it
     * again every time a timezone field goes to the watch.
     */
    function resolveOffset(place: GeoPlace) {
      const xhr = new XMLHttpRequest();
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude + '&current_weather=true&timezone=auto';

      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            let offsetMinutes = 0;
            if (typeof data.utc_offset_seconds !== 'undefined') {
              offsetMinutes = Math.round(data.utc_offset_seconds / 60);
            }
            // timezone=auto makes the call name the zone as well, and the zone is what the offset
            // is read off later. the minutes are kept as the answer for a watch whose runtime
            // cannot look a zone up
            const zone = typeof data.timezone === 'string' ? data.timezone : '';
            hiddenEl.value = JSON.stringify({
              lat: place.latitude,
              lon: place.longitude,
              label: labelFor(place),
              offset: offsetMinutes,
              tz: zone,
            });

            // the prompt comes down here rather than on the tap, since the tap only writes the
            // minutes. saving before this lands keeps a place with no zone, which is the one thing
            // the prompt is there to catch
            if (zone) {
              noteEl.style.display = 'none';
            }
          } catch (error) {}
        }
      };
      xhr.open('GET', url);
      xhr.send();
    }

    /** Renders the geocoder results as a clickable dropdown, persisting the pick on selection. */
    function renderResults(results: GeoPlace[]) {
      hideList();
      if (!results || !results.length) {
        return;
      }

      results.forEach(function(place: GeoPlace) {
        const item = document.createElement('li');
        item.className = 'loc-item';
        item.textContent = labelFor(place);
        item.addEventListener('click', function(event) {
          event.stopPropagation();
          queryEl.value = labelFor(place);

          // pre-fill the JSON in case the offset fetch never comes back
          hiddenEl.value = JSON.stringify({
            lat: place.latitude,
            lon: place.longitude,
            label: labelFor(place),
            offset: 0,
          });

          resolveOffset(place);
          hideList();
        });
        listEl.appendChild(item);
      });

      listEl.classList.add('show');
    }

    /** Queries the Open-Meteo geocoder for the typed term, ignoring a stale response that lands after a newer query. */
    function search(query: string) {
      const mySeq = ++seq;
      const xhr = new XMLHttpRequest();
      const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
        encodeURIComponent(query) + '&count=5&language=en&format=json';

      xhr.onload = function() {
        if (mySeq !== seq) {
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            renderResults(data && data.results);
          } catch (error) {
            hideList();
          }
        } else {
          hideList();
        }
      };

      xhr.onerror = function() {
        if (mySeq === seq) {
          hideList();
        }
      };
      xhr.ontimeout = function() {
        if (mySeq === seq) {
          hideList();
        }
      };
      xhr.timeout = 10000;

      xhr.open('GET', url);
      xhr.send();
    }

    queryEl.addEventListener('input', function() {
      hiddenEl.value = '';
      noteEl.style.display = 'none';
      const query = (queryEl.value || '').trim();

      if (timer) {
        clearTimeout(timer);
      }
      if (query.length < 2) {
        seq++;
        return hideList();
      }

      timer = setTimeout(function() { search(query); }, 300);
    });

    document.addEventListener('click', function(event) {
      if (!root.contains(event.target as Node)) {hideList();}
    });
  },
};
