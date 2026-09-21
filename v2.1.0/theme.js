// light and dark for every page of the docs site, the Doxygen, TypeDoc, and coverage pages included
// the choice lives under the same two localStorage keys the doxygen-awesome toggle uses, so a theme
// picked on any page carries to the rest. dark-mode or light-mode goes on the html element, which is what
// site.css, site-bar.css, coverage.css, and doxygen-awesome read
// every page loads this in its head, so the class is set before the first paint
(function () {
  var DARK_IN_LIGHT = 'prefers-dark-mode-in-light-mode';
  var LIGHT_IN_DARK = 'prefers-light-mode-in-dark-mode';
  var OPENED = 'pebble-docs-opened';
  // TypeDoc reads its own key as each of its pages loads, so it is kept in step as well
  var TYPEDOC_THEME = 'tsd-theme';

  var media = window.matchMedia('(prefers-color-scheme: dark)');

  // a choice made on this page, held so the toggle still works when storage is blocked
  var override = null;

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
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
    } catch (e) {
      // storage is blocked, so the choice only lasts for this page
    }
  }

  // a Pebble screen with nothing lit up is black, so a first visit opens dark whatever the system is set to
  // once the marker is down, whatever the reader picks is left alone
  if (!read(OPENED)) {
    store(OPENED, 'true');
    if (!media.matches) {
      store(DARK_IN_LIGHT, 'true');
    }
  }

  // the stored keys only record a difference from the system setting, the same way doxygen-awesome reads them
  function wantsDark() {
    if (override !== null) {
      return override;
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
    store(TYPEDOC_THEME, dark ? 'dark' : 'light');

    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      var label = buttons[i].querySelector('.theme-toggle-label');
      if (label) {
        label.textContent = dark ? 'Light' : 'Dark';
      }
      buttons[i].setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }

  function toggle() {
    var dark = !wantsDark();
    if (media.matches) {
      store(LIGHT_IN_DARK, dark ? null : 'true');
      store(DARK_IN_LIGHT, null);
    } else {
      store(DARK_IN_LIGHT, dark ? 'true' : null);
      store(LIGHT_IN_DARK, null);
    }
    override = dark;
    apply();
  }

  apply();

  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', toggle);
    }
    apply();
  });

  // a page left open follows the system when nothing has been picked on it
  media.addEventListener('change', function () {
    override = null;
    apply();
  });
})();
