// light and dark for every page of the docs site, the Doxygen, TypeDoc, and coverage pages included
// the choice lives under two localStorage keys, so a theme picked on any page carries to the rest.
// they carry this site's own prefix, since every project published under the same GitHub Pages address
// shares one localStorage and a doxygen-awesome site there would read and write keys named its way.
// dark-mode or light-mode goes on the html element, which is what site.css, site-bar.css, coverage.css,
// and doxygen-awesome read
// every page loads this in its head, so the class is set before the first paint
(function () {
  var DARK_IN_LIGHT = 'pebble-docs-dark-in-light';
  var LIGHT_IN_DARK = 'pebble-docs-light-in-dark';
  var OPENED = 'pebble-docs-seen';
  // TypeDoc reads its own key as each of its pages loads, so it is kept in step as well. that name is
  // TypeDoc's and cannot carry the prefix
  var TYPEDOC_THEME = 'tsd-theme';

  var media = window.matchMedia('(prefers-color-scheme: dark)');

  // a choice made on this page, held so the toggle still works when storage is blocked
  var override = null;

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  // a value of null removes the key
  function store(key, value) {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      // storage is blocked, so the choice only lasts for this page
    }
  }

  // a Pebble screen with nothing lit up is black, so a first visit opens dark whatever the system is set to
  // the dark choice is stored for a light system as well, so a first visit made while the system was dark
  // still opens dark on a later visit made while it is light. once the marker is down, whatever the reader
  // picks is left alone
  function seedFirstVisit() {
    if (!read(OPENED)) {
      store(OPENED, 'true');
      store(DARK_IN_LIGHT, 'true');
    }
  }
  seedFirstVisit();

  // with storage blocked nothing above stuck, so every page opens dark the way a first visit does
  var blocked = read(OPENED) === null;

  // the stored keys only record a difference from the system setting
  function wantsDark() {
    if (override !== null) {
      return override;
    }
    if (blocked) {
      return true;
    }
    return media.matches ? !read(LIGHT_IN_DARK) : !!read(DARK_IN_LIGHT);
  }

  function apply() {
    var dark = wantsDark();
    var root = document.documentElement;
    root.classList.toggle('dark-mode', dark);
    root.classList.toggle('light-mode', !dark);
    // TypeDoc takes its colours from data-theme, and its own settings control is hidden on the site
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    // only a TypeDoc page stores its key, which that page's own script reads on load. any other TypeDoc
    // site under the same address shares the key, so the rest of this site leaves it alone
    if (root.hasAttribute('data-base')) {
      store(TYPEDOC_THEME, dark ? 'dark' : 'light');
    }

    var buttons = document.querySelectorAll('.theme-toggle');
    for (var index = 0; index < buttons.length; index++) {
      var label = buttons[index].querySelector('.theme-toggle-label');
      if (label) {
        label.textContent = dark ? 'Light' : 'Dark';
      }
      buttons[index].setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  // a pick holds whatever the system is set to, so both keys are written. keeping only the one for the
  // system of the moment would drop the dark default a first visit stored, and a later visit on the other
  // system setting would open the other way
  function toggle() {
    var dark = !wantsDark();
    store(DARK_IN_LIGHT, dark ? 'true' : null);
    store(LIGHT_IN_DARK, dark ? null : 'true');
    override = dark;
    apply();
  }

  apply();

  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var index = 0; index < buttons.length; index++) {
      buttons[index].addEventListener('click', toggle);
    }
    apply();
  });

  // a page left open follows the system when nothing has been picked on it. with storage blocked the page
  // opens dark whatever the system is, so a system change has nothing to follow and a pick made here stays
  media.addEventListener('change', function () {
    if (blocked) {
      return;
    }
    override = null;
    apply();
  });

  // a page brought back by the back button keeps the theme it was left with, and another open tab never
  // sees a pick made here, so both read the stored choice again. with storage blocked there is nothing
  // stored to read, so the pick made on the page stays
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && !blocked) {
      override = null;
      apply();
    }
  });
  // a key of null means another tab cleared the whole store, which drops the pick and the first-visit
  // marker as well. the default goes back in the way a reload would put it, so this tab matches the next load
  window.addEventListener('storage', function (event) {
    if (event.key === null || event.key === DARK_IN_LIGHT || event.key === LIGHT_IN_DARK) {
      if (event.key === null) {
        seedFirstVisit();
      }
      override = null;
      apply();
    }
  });
})();
