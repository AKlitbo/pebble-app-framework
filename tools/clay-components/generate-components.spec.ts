/**
 * Specs for the clay-components generator.
 *
 * The generator bundles each component's pieces into one initialize the Clay
 * webview can run on its own, so the checks here pin the entry it hands esbuild,
 * the CSS squeeze, and the finished wrapper. Those run against a small recipe
 * under fixtures/, so they need no face.
 *
 * The staleness checks regenerate every component a face commits and compare it
 * to the committed file, so an edited piece cannot ship without its `npm run gen:clay`.
 * They run where the framework is mounted beside faces that commit components.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, test, expect } from 'vitest';
import { listFaceNames, faceDir } from '../faces';
import { ENGINE } from '../paths';
import {
  rootsFor,
  findManifests,
  findInitPiece,
  buildEntrySource,
  minifyCss,
  buildComponentSource,
} from './generate-components';

// the manifests are loaded by path, the same way the generator does it
const requireManifest = createRequire(import.meta.url);

// a face-shaped folder holding one small recipe, laid out the way the generator reads a face
const FIXTURE_FACE = path.join(import.meta.dirname, 'fixtures', 'face');

/** The fixture's builder roots, shaped the way rootsFor builds them for a face in no family. */
const FIXTURE_ROOTS = {
  face: { base: path.join(FIXTURE_FACE, 'src'), builder: path.join('pkjs', 'clay', 'builder') },
  core: null,
  lib: { base: path.join(ENGINE, 'ts'), builder: path.join('clay', 'builder') },
  faceRoot: FIXTURE_FACE,
};

/** The fixture manifest, its path and its directory. */
function fixtureManifest() {
  const manifestPath = findManifests(FIXTURE_ROOTS)[0];
  return { manifestPath, manifest: requireManifest(manifestPath).default, dir: path.dirname(manifestPath) };
}

describe('findManifests', () => {
  /** A recipe the lookup misses is never generated, so its component would quietly go stale. */
  test('finds the recipe under the face builder dir', () => {
    const result = findManifests(FIXTURE_ROOTS).map((manifestPath) => path.basename(manifestPath));

    expect(result).toEqual(['sample.manifest.ts']);
  });
});

describe('findInitPiece', () => {
  /** Without the init piece the bundle would have no entry to call, so a missing one must throw. */
  test('finds the manifest piece named init', () => {
    const { manifest } = fixtureManifest();

    const result = findInitPiece(manifest);

    expect(path.basename(result)).toBe('init');
  });

  /** A manifest with no init piece would bundle to a component that never wires itself up. */
  test('throws when no piece is named init', () => {
    const manifest = { name: 'broken', pieces: ['ts/layout/geometry'] };

    const call = () => findInitPiece(manifest);

    expect(call).toThrow(/no piece named init/);
  });
});

describe('buildEntrySource', () => {
  /** A dropped piece would tree shake out of the bundle and vanish from the config page. */
  test('requires every piece and re-exports the init piece', () => {
    const manifest = { pieces: ['ts/shared/thumbs', 'ts/layout/init'] };

    const result = buildEntrySource(manifest, 'ts/layout/init');

    expect(result).toContain('require("./ts/shared/thumbs");');
    expect(result).toContain('module.exports = require("./ts/layout/init");');
  });
});

describe('minifyCss', () => {
  /** An over-eager squeeze that eats a space inside a value breaks the rule on the config page. */
  test('strips comments and tightens punctuation without touching values', () => {
    const css = '/* a note */\n.a > .b:active {\n  color: #fff;\n  border: 1px solid rgba(0, 0, 0, 0.6);\n}\n';

    const result = minifyCss(css);

    expect(result).toBe('.a>.b:active{color:#fff;border:1px solid rgba(0,0,0,0.6)}');
  });
});

describe('buildComponentSource', () => {
  /** The manipulator calls init with the component as this, so the call has to survive into the wrapper. */
  test('wraps the bundle and calls init with the component this', async () => {
    const { manifestPath } = fixtureManifest();

    const result = await buildComponentSource(manifestPath, FIXTURE_ROOTS);

    expect(result.source).toContain('__clayComponent.init.call(this);');
  });

  /** Clay injects the template and style as strings, so both have to arrive flattened and squeezed. */
  test('inlines the flattened template and the minified style', async () => {
    const { manifestPath } = fixtureManifest();

    const result = await buildComponentSource(manifestPath, FIXTURE_ROOTS);

    expect(result.source).toContain(`template: ${JSON.stringify('<div class="sample"><span class="sample-label"></span></div>')}`);
    expect(result.source).toContain(`style: ${JSON.stringify('.sample{color:#fff}')}`);
  });

  /** The pkjs build copies components out of the face, so one landing anywhere else never ships. */
  test('lands the component in the face at the manifest output', async () => {
    const { manifestPath } = fixtureManifest();

    const result = await buildComponentSource(manifestPath, FIXTURE_ROOTS);

    expect(result.output).toBe(path.join(FIXTURE_FACE, 'src', 'pkjs', 'clay', 'sample-component.g.js'));
  });
});

/** Whether a face commits a bundled component, found by its output rather than its manifests. */
function hasCommittedComponent(face: string): boolean {
  const clayDir = path.join(faceDir(face), 'src', 'pkjs', 'clay');
  return fs.existsSync(clayDir) && fs.readdirSync(clayDir).some((name) => name.endsWith('-component.g.js'));
}

const FACE_NAMES = listFaceNames();

/**
 * Every face that ships a Clay builder, with the manifests it builds.
 *
 * Discovered rather than listed, so a new face carrying a builder is guarded the day it lands
 * instead of the day someone remembers to add it here. A face with no builder yields no
 * manifests and contributes no tests.
 */
const BUILDER_FACES = FACE_NAMES
  .map((face) => ({ face, roots: rootsFor(face) }))
  .map((entry) => ({ ...entry, manifests: findManifests(entry.roots) }))
  .filter((entry) => entry.manifests.length > 0);

/** The faces that commit a component, found by output so they can check the discovery above. */
const COMMITTING_FACES = FACE_NAMES.filter((face) => hasCommittedComponent(face));

describe.skipIf(COMMITTING_FACES.length === 0)('generated components', () => {
  /**
   * The staleness checks below are generated from what the discovery found, so a discovery that
   * quietly returned nothing would leave this suite green with nothing in it. Every face that
   * commits a component has to be found here, and losing one has to fail rather than pass silently.
   */
  test('covers every face that commits a component', () => {
    const result = BUILDER_FACES.map((entry) => entry.face);

    expect(result).toEqual(COMMITTING_FACES);
  });

  BUILDER_FACES.forEach(({ face, roots, manifests }) => {
    manifests.forEach((manifestPath) => {
      const name = manifestPath.replace(/\\/g, '/').split('/').pop();

      /** A piece edit without a gen:clay run would ship a config page that ignores the change. */
      test(`${face}: ${name} output is not stale`, async () => {
        const built = await buildComponentSource(manifestPath, roots);

        const committed = fs.readFileSync(built.output, 'utf8').replace(/\r\n/g, '\n');

        expect(committed).toBe(built.source);
      });
    });
  });
});
