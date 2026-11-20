// the version picker in the shared bar on every page of the docs site
// each version of the site sits in a folder of its own, main/ or one named for a release tag, with
// versions.json one level above them listing every version
// the picker opens on the version the page belongs to and stays disabled until that list loads, so a copy
// of the site with no list beside it, such as a local build or a PR's upload, still shows which build it is
(function () {
  // how long a change made with the keys waits for the next step before the page goes to it
  var KEY_PAUSE_MS = 600;

  function label(version, latest) {
    if (version === 'main') {
      return 'main (unreleased)';
    }
    return version === latest ? version + ' (latest)' : version;
  }

  // the page's path inside its version folder, such as ts/functions/app.html, with any #anchor kept
  function pageInside(site) {
    var path = location.pathname;
    var page = path.indexOf(site.pathname) === 0 ? path.slice(site.pathname.length) : '';
    return page + location.hash;
  }

  // the same page in another version, or that version's home page when the page is not in it
  function go(site, version) {
    var home = new URL('../' + version + '/', site);
    var same = new URL(pageInside(site), home);
    fetch(same, { method: 'HEAD' })
      .then(function (response) {
        location.href = response.ok ? same.href : home.href;
      })
      .catch(function () {
        location.href = home.href;
      });
  }

  function fill(select, list) {
    var current = select.value;
    select.textContent = '';
    for (var index = 0; index < list.versions.length; index++) {
      var option = document.createElement('option');
      option.value = list.versions[index];
      option.textContent = label(list.versions[index], list.latest);
      option.selected = list.versions[index] === current;
      select.appendChild(option);
    }
    select.disabled = false;
  }

  function attach(select) {
    // the version's own folder, such as .../pebble-app-framework/v2.0.0/
    var site = new URL(select.getAttribute('data-root') || '', location.href);
    var current = select.value;

    // GitHub Pages lets a browser keep the list for ten minutes, and a list from before a release leaves
    // that release out, so it is checked with the server each time
    fetch(new URL('../versions.json', site), { cache: 'no-cache' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (list) {
        // a list that leaves this build out would open the picker on the wrong version
        if (list && Array.isArray(list.versions) && list.versions.indexOf(current) !== -1) {
          fill(select, list);
        }
      })
      .catch(function () {
        // no list beside this copy of the site, so the picker stays as it is
      });

    // on Windows the arrow keys change a closed picker's value and fire change on every step, which would
    // leave for the next version before the reader got any further. a change made with the keys waits for
    // a short pause, so the arrows can step through the list, and Enter goes straight away. a pick made
    // with the pointer goes at once. the pause covers a pick from a popup opened with the keys as well,
    // since the page cannot tell an open popup from a closed picker
    var byPointer = false;
    var pending = null;
    function cancel() {
      clearTimeout(pending);
      pending = null;
    }
    select.addEventListener('pointerdown', function () {
      byPointer = true;
    });
    // Escape takes back a step made with the keys, the way it closes a popup without picking
    select.addEventListener('keydown', function (event) {
      byPointer = false;
      if (event.key === 'Enter' && pending !== null) {
        cancel();
        go(site, select.value);
      } else if (event.key === 'Escape' && pending !== null) {
        cancel();
        select.value = current;
      }
    });
    select.addEventListener('change', function () {
      cancel();
      // stepping away and back to the page's own version is no move, and going there would reload the page
      if (select.value === current) {
        return;
      }
      if (byPointer) {
        go(site, select.value);
        return;
      }
      pending = setTimeout(function () {
        pending = null;
        go(site, select.value);
      }, KEY_PAUSE_MS);
    });
    // a choice stepped to with the keys and then left behind goes back to the page's own version
    select.addEventListener('blur', function () {
      if (pending !== null) {
        cancel();
        select.value = current;
      }
    });

    // a page the browser brings back with Back keeps the version picked on the way out, and picking that
    // one again fires no change, so the picker goes back to the page's own version. a step still waiting
    // when the page was left would go on from the restored page, so it is dropped
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        cancel();
        select.value = current;
      }
    });
  }

  function init() {
    var selects = document.querySelectorAll('.site-bar-version');
    for (var index = 0; index < selects.length; index++) {
      attach(selects[index]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
