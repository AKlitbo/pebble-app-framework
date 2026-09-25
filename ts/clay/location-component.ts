/**
 * Clay custom component for live location autocomplete.
 *
 * As the user types, it queries Open-Meteo's free geocoding API and shows
 * matching places. Selecting one stores the resolved coordinates so the watch
 * never has to geocode.
 *
 * A timezone field offers time zones alongside the places, since the geocoder only knows
 * populated ones and there is no city called UTC. Typing utc, zulu, a zone name, or a plain
 * offset such as utc+05:30 all land on a row that can be picked.
 *
 * Persisted value:
 *   JSON string {lat, lon, label, offset, tz, fixed}
 *
 * `tz` is the IANA zone, such as Europe/London, and `offset` is how far ahead of UTC that zone was
 * when the pick was made. A timezone field is sent to the watch as "offset,label" by the pkjs
 * side, which reads the offset off the zone each time so it follows a daylight saving switch. A
 * zone pick carries no coordinates, and a plain offset carries no zone either, so it sets `fixed`
 * to say the missing zone is on purpose.
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
  timezone?: string;  // the IANA zone the geocoder names for the place
}

/**
 * Intl grew a list of the zones it knows in ES2022, which is newer than the lib this compiles
 * against, so the shape is spelled out here. It is a type and nothing else, which is what lets
 * `initialize` mention it and still serialise clean.
 */
interface IntlWithZones {
  supportedValuesOf?(key: string): string[];
}

/** One time zone row the picker offers, ready to persist as it stands. */
interface ZoneChoice {
  zone: string;    // the IANA name, or empty for an offset no zone matches
  label: string;   // the word the watch shows
  offset: number;  // minutes ahead of UTC, negative west of it
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
    '.loc-search .loc-hint { float: right; opacity: 0.55; }',
    '.loc-search .loc-note { position: relative; margin: 0.7rem 0 0.15rem; padding: 0.5rem 0.6rem 0.5rem 2.1rem; background: rgba(255, 71, 0, 0.1); border-left: 3px solid #ff4700; font-size: 0.85em; line-height: 1.4; }',
    '.loc-search .loc-note:before { content: "!"; position: absolute; left: 0.6rem; top: 0.65rem; width: 1.15em; height: 1.15em; border: 1px solid #ff4700; border-radius: 50%; color: #ff4700; font-size: 0.95em; font-weight: 700; line-height: 1.1em; text-align: center; }',
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
      let fixed = false;

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
          if (parsed && parsed.fixed) {
            fixed = true;
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
      // picking the place again is the whole fix, and it happens right here. a plain offset has no
      // zone on purpose and no daylight saving to follow, so it is left alone
      const messageKey = this.config.messageKey || '';
      const wantsZone = /TIME_?ZONE/i.test(messageKey);
      const noteEl = root.querySelector('.loc-note') as HTMLElement;
      noteEl.style.display = (wantsZone && label && !zone && !fixed) ? 'block' : 'none';
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
   *
   * A timezone field also matches time zones and plain offsets, which needs no network, so those
   * rows are on screen before the geocoder has been asked anything.
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
    // counts every pick and edit, so a zone lookup that answers after the user moved on leaves
    // the field alone
    let picks = 0;

    // only a timezone field offers zones. the weather location wants a real place with
    // coordinates, and a row like UTC has none
    const wantsZone = /TIME_?ZONE/i.test(self.config.messageKey || '');

    // the zone rows showing for what is typed now, so a geocoder answer can redraw the list
    // without losing them
    let zoneRows: ZoneChoice[] = [];

    // Intl names about four hundred zones and costs nothing to ask. it leaves out UTC and every
    // Etc entry though, so UTC goes on by hand. an older webview without the call still reaches
    // every named zone through the city search below
    let zoneNames: string[] = [];
    if (wantsZone) {
      try {
        const lister = (Intl as unknown as IntlWithZones).supportedValuesOf;
        if (typeof lister === 'function') {
          zoneNames = lister.call(Intl, 'timeZone').slice();
        }
      } catch (error) {}
      zoneNames.unshift('UTC');
    }

    // reading a zone means building a formatter, which is the expensive half, so each zone keeps
    // the answer it gave. it is only ever read for a dropdown row so a stale minute is harmless
    const offsets: Record<string, number> = {};

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

    /** Two digits, so an offset reads UTC+05:30 rather than UTC+5:30. */
    function pad(value: number) {
      return value < 10 ? '0' + value : String(value);
    }

    /** Minutes ahead of UTC written the way people say it. */
    function offsetText(minutes: number) {
      const away = Math.abs(minutes);
      return 'UTC' + (minutes < 0 ? '-' : '+') + pad(Math.floor(away / 60)) + ':' + pad(away % 60);
    }

    /**
     * How far ahead of UTC a zone is right now, in minutes. Measures the zone's own clock against
     * UTC so the half hour and quarter hour zones come out right too. Zero when the webview will
     * not read that zone, which only costs the dropdown a hint since the pkjs side works the real
     * number out again on every send.
     */
    function zoneOffset(zone: string): number {
      if (typeof offsets[zone] === 'number') {
        return offsets[zone];
      }

      let minutes = 0;
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).formatToParts(new Date());

        const at: Record<string, string> = {};
        parts.forEach(function(part) { at[part.type] = part.value; });

        // midnight comes back as hour 24 in some engines, so fold it onto the day it belongs to
        const hour = Number(at.hour) % 24;
        const wall = Date.UTC(Number(at.year), Number(at.month) - 1, Number(at.day), hour, Number(at.minute));
        const now = Date.now();
        if (isFinite(wall)) {
          minutes = Math.round((wall - Math.floor(now / 60000) * 60000) / 60000);
        }
      } catch (error) {}

      offsets[zone] = minutes;
      return minutes;
    }

    /**
     * The word the watch shows for a zone. UTC keeps its name, anything else uses the city on the
     * end of it, so Australia/Adelaide reads ADELAIDE in the panel header rather than running off
     * the side of it.
     */
    function zoneLabel(zone: string) {
      if (zone === 'UTC') {
        return 'UTC';
      }

      return zone.substring(zone.lastIndexOf('/') + 1).replace(/_/g, ' ');
    }

    /**
     * A typed offset turned into a row that can be picked. Takes utc+5, +05:30, gmt-8 and -0330
     * alike.
     *
     * A whole hour has a real zone behind it, written Etc/GMT with the sign the other way round,
     * so UTC+5 is stored as Etc/GMT-5. Anything finer has no zone at all, so it keeps the minutes
     * on their own. A fixed offset has no daylight saving to follow, so nothing is lost by that.
     */
    function offsetChoice(needle: string): ZoneChoice | null {
      const parts = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(needle);
      if (!parts) {
        return null;
      }

      const hours = Number(parts[2]);
      const minutes = Number(parts[3] || 0);
      if (hours > 14 || minutes > 59) {
        return null;
      }

      const total = (parts[1] === '-' ? -1 : 1) * (hours * 60 + minutes);
      if (total === 0) {
        return { zone: 'UTC', label: 'UTC', offset: 0 };
      }

      return {
        zone: minutes === 0 ? 'Etc/GMT' + (total < 0 ? '+' : '-') + hours : '',
        label: offsetText(total),
        offset: total,
      };
    }

    /**
     * The zone rows for what has been typed, likeliest first and capped so the list stays
     * scannable. Empty for a field that is not a timezone.
     */
    function zoneMatches(query: string): ZoneChoice[] {
      if (!wantsZone) {
        return [];
      }

      // spaces and underscores are noise here, so New York, new_york and newyork all match
      const needle = query.toLowerCase().replace(/[\s_]/g, '');
      const found: ZoneChoice[] = [];

      const typed = offsetChoice(needle);
      if (typed) {
        found.push(typed);
      }

      // the words people reach for when they mean UTC, none of which is a zone name
      let meansUtc = false;
      ['utc', 'zulu', 'gmt', 'greenwich'].forEach(function(alias) {
        if (alias.indexOf(needle) === 0) {
          meansUtc = true;
        }
      });
      if (meansUtc && !typed) {
        found.push({ zone: 'UTC', label: 'UTC', offset: 0 });
      }

      // the city on the end is the word people type, so those rank first. matching anywhere after
      // that is what makes a query like europe or pacific useful
      const ending: string[] = [];
      const anywhere: string[] = [];
      zoneNames.forEach(function(zone) {
        const lower = zone.toLowerCase().replace(/_/g, '');
        if (lower.substring(lower.lastIndexOf('/') + 1).indexOf(needle) === 0) {
          ending.push(zone);
        } else if (lower.indexOf(needle) !== -1) {
          anywhere.push(zone);
        }
      });

      ending.concat(anywhere).forEach(function(zone) {
        if (found.length >= 5 || zone === 'UTC') {
          return;
        }
        found.push({ zone: zone, label: zoneLabel(zone), offset: zoneOffset(zone) });
      });

      return found.slice(0, 5);
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
      const myPick = picks;
      const xhr = new XMLHttpRequest();
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + place.latitude + '&longitude=' + place.longitude + '&timezone=auto';

      xhr.onload = function() {
        if (myPick !== picks) {
          return;
        }
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
            const zone = typeof data.timezone === 'string' && data.timezone ? data.timezone : (place.timezone || '');
            hiddenEl.value = JSON.stringify({
              lat: place.latitude,
              lon: place.longitude,
              label: labelFor(place),
              offset: offsetMinutes,
              tz: zone,
            });

            // a place the geocoder gave no zone for only gets one here. saving before this lands
            // keeps a place with no zone, which is the one thing the prompt is there to catch
            if (zone) {
              noteEl.style.display = 'none';
            }
          } catch (error) {}
        }
      };
      xhr.open('GET', url);
      xhr.send();
    }

    /**
     * Renders the dropdown: the matching zones first, then the places the geocoder found.
     *
     * Both halves are drawn together rather than each owning the list, since the zones are ready
     * at once and the places arrive whenever the network gets round to it.
     */
    function renderResults(zones: ZoneChoice[], results: GeoPlace[]) {
      hideList();

      zones.forEach(function(choice: ZoneChoice) {
        const item = document.createElement('li');
        item.className = 'loc-item loc-item-zone';
        // the full zone name, since Adelaide on its own does not say which one
        item.textContent = choice.zone || choice.label;

        // what that zone reads against UTC, unless the row already says so itself
        if (choice.label.indexOf('UTC') !== 0) {
          const hint = document.createElement('span');
          hint.className = 'loc-hint';
          hint.textContent = offsetText(choice.offset);
          item.appendChild(hint);
        }

        item.addEventListener('click', function(event) {
          event.stopPropagation();
          queryEl.value = choice.label;
          picks++;

          // no coordinates, since a zone is not a place and nothing reads them back. the minutes
          // are only a fallback for a phone that cannot look a zone up, and fixed says the
          // missing zone on an offset row is meant
          hiddenEl.value = JSON.stringify({
            label: choice.label,
            offset: choice.offset,
            tz: choice.zone,
            fixed: !choice.zone,
          });

          noteEl.style.display = 'none';
          hideList();
        });
        listEl.appendChild(item);
      });

      (results || []).forEach(function(place: GeoPlace) {
        const item = document.createElement('li');
        item.className = 'loc-item';
        item.textContent = labelFor(place);
        item.addEventListener('click', function(event) {
          event.stopPropagation();
          queryEl.value = labelFor(place);
          picks++;

          // the geocoder already names the place's zone, so the pick is whole from the tap and a
          // save straight away or offline still keeps the right clock. the lookup below only
          // fills in the minutes, or the zone for a place the geocoder gave none
          const zone = typeof place.timezone === 'string' ? place.timezone : '';
          hiddenEl.value = JSON.stringify({
            lat: place.latitude,
            lon: place.longitude,
            label: labelFor(place),
            offset: zone ? zoneOffset(zone) : 0,
            tz: zone,
          });

          // typing hid the prompt, so a timezone field puts it back until a zone turns up
          noteEl.style.display = (wantsZone && !zone) ? 'block' : 'none';

          resolveOffset(place);
          hideList();
        });
        listEl.appendChild(item);
      });

      if (listEl.firstChild) {
        listEl.classList.add('show');
      }
    }

    /**
     * Queries the Open-Meteo geocoder for the typed term, ignoring a stale response that lands
     * after a newer query.
     *
     * A geocoder that fails, times out, or knows nothing falls back to the zone rows rather than
     * an empty list. Offline on a phone is the normal way to reach the config page, and UTC needs
     * nothing from the network.
     */
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
            renderResults(zoneRows, data && data.results);
          } catch (error) {
            renderResults(zoneRows, []);
          }
        } else {
          renderResults(zoneRows, []);
        }
      };

      xhr.onerror = function() {
        if (mySeq === seq) {
          renderResults(zoneRows, []);
        }
      };
      xhr.ontimeout = function() {
        if (mySeq === seq) {
          renderResults(zoneRows, []);
        }
      };
      xhr.timeout = 10000;

      xhr.open('GET', url);
      xhr.send();
    }

    queryEl.addEventListener('input', function() {
      hiddenEl.value = '';
      picks++;
      noteEl.style.display = 'none';
      const query = (queryEl.value || '').trim();

      if (timer) {
        clearTimeout(timer);
      }
      if (query.length < 2) {
        seq++;
        zoneRows = [];
        return hideList();
      }

      // the zones need nothing from the network, so they are on screen while the geocoder is
      // still being waited on
      zoneRows = zoneMatches(query);
      renderResults(zoneRows, []);

      timer = setTimeout(function() { search(query); }, 300);
    });

    document.addEventListener('click', function(event) {
      if (!root.contains(event.target as Node)) {hideList();}
    });
  },
};
