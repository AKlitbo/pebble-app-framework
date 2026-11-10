# Third-Party Notices

The framework is dual-licensed under the AGPL-3.0-or-later or the PolyForm Noncommercial License 1.0.0, see [LICENSE](LICENSE). It bundles the third-party work below, which keeps its own licence.

## ical.js

The phone-side calendar reader. The pkjs build copies it into the `.pbw` of a face that uses the calendar, and a face that does not ships none of it.

- **Source:** <https://github.com/kewisch/ical.js>
- **Licence:** Mozilla Public License 2.0, published at <https://www.mozilla.org/en-US/MPL/2.0/>. The full text also ships in the package at `node_modules/ical.js/LICENSE`
- **What Ships:** the package's own prebuilt `dist/ical.es5.min.cjs`, copied in unchanged by the pkjs build. It is not modified, patched or re-bundled, so the source that produced it is the upstream repository above, and its licence header travels inside the bundle
- **What a Plugin App Ships:** the same prebuilt file, bundled into the plugin's `plugin.js` with the rest of its script, since the Pebble app loads a plugin's script as one file. Its code is not changed, and its licence header stays at the top of it inside `plugin.js`, marked so the bundler keeps it. The source that produced it is the upstream repository above

The MPL covers ical.js and nothing else here. Section 1.10 of that licence says a file carrying none of its code is not a modification of it, so the rest of the framework stays under its own terms. In a face, keeping ical.js in a file of its own is deliberate, and is what section 1.7 asks of a larger work. A plugin app's `plugin.js` is a bundle that carries ical.js unchanged beside the plugin's own code, which is distributing ical.js in executable form. Section 3.2 asks that its source be available and its licence named, which the source above and this notice do. The MPL 2.0 is also compatible with the AGPL through its secondary licence provision.

Refer to the source above for the full terms.
