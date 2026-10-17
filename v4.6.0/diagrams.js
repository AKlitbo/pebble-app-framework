// draws the Mermaid diagrams on a docs page, in the site's own colours
// the markdown keeps each diagram as a mermaid fence, which GitHub draws on its own, and the site build
// turns it into a pre with the mermaid class. a page with none never loads Mermaid at all
// Mermaid comes from jsDelivr at a pinned version. without it, or without scripts, the diagram's
// source stays on the page as text
(function () {
  var MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs';

  function start() {
    var blocks = Array.prototype.slice.call(document.querySelectorAll('pre.mermaid'));

    if (blocks.length === 0) {
      return;
    }

    // Mermaid swaps each block's text for the drawing, so the source is kept to draw again in the other theme
    blocks.forEach(function (block) {
      block.setAttribute('data-source', block.textContent);
    });

    import(MERMAID)
      .then(function (module) {
        var mermaid = module.default;

        draw(mermaid, blocks);

        // theme.js flips dark-mode and light-mode on the html element, and the diagrams follow
        var last = document.documentElement.className;
        new MutationObserver(function () {
          var now = document.documentElement.className;

          if (now !== last) {
            last = now;
            draw(mermaid, blocks);
          }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      })
      .catch(function () {
        // the CDN could not be reached, so the source text stays as it is
      });
  }

  // the palette site.css set for the current theme, read off the page so the two never drift apart
  function colours() {
    var style = getComputedStyle(document.documentElement);
    var read = function (name) {
      return style.getPropertyValue(name).trim();
    };

    return {
      background: read('--paper'),
      primaryColor: read('--paper-raised'),
      primaryTextColor: read('--ink'),
      primaryBorderColor: read('--ink'),
      secondaryColor: read('--paper'),
      tertiaryColor: read('--paper'),
      lineColor: read('--ink-muted'),
      textColor: read('--ink'),
      noteBkgColor: read('--paper-raised'),
      noteTextColor: read('--ink'),
      noteBorderColor: read('--rule'),
      actorBkg: read('--paper-raised'),
      actorBorder: read('--ink'),
      actorTextColor: read('--ink'),
      signalColor: read('--ink'),
      signalTextColor: read('--ink'),
      labelBoxBkgColor: read('--paper-raised'),
      labelBoxBorderColor: read('--rule'),
      fontFamily: read('--sans'),
      fontSize: '14px',
      // a chart's first line is the site's signal colour and the second is muted, so two lines read apart
      xyChart: {
        backgroundColor: read('--paper-raised'),
        plotColorPalette: read('--signal') + ', ' + read('--ink-muted'),
      },
    };
  }

  function draw(mermaid, blocks) {
    blocks.forEach(function (block) {
      block.removeAttribute('data-processed');
      block.textContent = block.getAttribute('data-source');
    });

    mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: colours(), securityLevel: 'strict' });
    mermaid.run({ nodes: blocks }).catch(function () {
      // a diagram Mermaid cannot read keeps its source text, which says what it meant
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
