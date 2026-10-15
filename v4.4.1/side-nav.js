// keeps a section's sidebar useful as the reader moves through it
// on a wide screen the sidebar sticks beside the text, and it is sized to the room left below its own top
// edge so it always ends inside the window. at the top of a page that room is shorter than the window,
// since the site bar sits above it, and a sidebar as tall as the window would hang its last pages out of
// sight with nothing to scroll. it then brings the page being read into view, or a page picked near the
// bottom of a long list would open with the sidebar back at the top
// on a narrow screen it folds the sidebar into a Pages button. the build writes it open, so without
// scripts it still lists every page, just above the text. the width matches the one in site.css that
// moves it above the text
(function () {
  var NARROW = '(max-width: 820px)';
  // the gap kept below the sidebar, matching its sticky top in site.css
  var GAP = 16;

  function fit(side) {
    if (window.matchMedia(NARROW).matches) {
      side.style.maxHeight = '';
      return;
    }

    var top = Math.max(side.getBoundingClientRect().top, GAP);
    side.style.maxHeight = window.innerHeight - top - GAP + 'px';
  }

  function settle() {
    var side = document.querySelector('details.side-nav');

    if (!side) {
      return;
    }

    if (window.matchMedia(NARROW).matches) {
      side.removeAttribute('open');
      return;
    }

    fit(side);

    var current = side.querySelector('[aria-current="page"]');

    if (current) {
      // centred in the sidebar's own scroll area, which leaves the page itself where it is
      var item = current.getBoundingClientRect();
      var box = side.getBoundingClientRect();
      side.scrollTop += item.top - box.top - (side.clientHeight - item.height) / 2;
    }

    // the room below the sidebar grows as the site bar scrolls away, so it is fitted again, once a frame
    var waiting = false;
    var refit = function () {
      if (!waiting) {
        waiting = true;
        window.requestAnimationFrame(function () {
          waiting = false;
          fit(side);
        });
      }
    };

    window.addEventListener('scroll', refit, { passive: true });
    window.addEventListener('resize', refit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', settle);
  } else {
    settle();
  }
})();
