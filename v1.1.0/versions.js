// the version picker in the shared bar on every page of the docs site
// each version of the site sits in a folder of its own, main/ or one named for a release tag, with
// versions.json one level above them listing every version
// the picker opens on the version the page belongs to and stays disabled until that list loads, so a copy
// of the site with no list beside it, such as a local build or a PR's upload, still shows which build it is
(function () {
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
    for (var i = 0; i < list.versions.length; i++) {
      var option = document.createElement('option');
      option.value = list.versions[i];
      option.textContent = label(list.versions[i], list.latest);
      option.selected = list.versions[i] === current;
      select.appendChild(option);
    }
    select.disabled = false;
  }

  function attach(select) {
    // the version's own folder, such as .../pebble-watchface-engine/v2.0.0/
    var site = new URL(select.getAttribute('data-root') || '', location.href);
    var current = select.value;

    fetch(new URL('../versions.json', site))
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

    select.addEventListener('change', function () {
      go(site, select.value);
    });
  }

  function init() {
    var selects = document.querySelectorAll('.site-bar-version');
    for (var i = 0; i < selects.length; i++) {
      attach(selects[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
