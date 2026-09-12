/**
 * Specs for the emit builder.
 *
 * The copy step runs between tsc and the Pebble build to place any committed Clay *.g.js
 * components into emit/ beside the compiled output. These specs pin what findGenerated hands
 * the copy: only .g.js files under src/pkjs, and never a clay/builder piece. They run against a
 * small face under fixtures/, and again against every real face where the engine is mounted.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { listFaces } from '../faces';
import { findGenerated, facePaths } from './build-pkjs';
import type { FacePaths } from './build-pkjs';

// a face-shaped folder with one component, one plain module, and a .g.js inside clay/builder
const FIXTURE = path.join(import.meta.dirname, 'fixtures');
const FIXTURE_SRC = path.join(FIXTURE, 'face', 'src', 'pkjs');

/** The fixture's paths, shaped the way facePaths builds them for a real face. */
const FIXTURE_PATHS: FacePaths = {
  faceSrc: FIXTURE_SRC,
  sandbox: path.join(FIXTURE, 'targets', 'face'),
  emit: path.join(FIXTURE, 'targets', 'face', 'emit'),
  emitPkjs: path.join(FIXTURE, 'targets', 'face', 'emit', 'face', 'src', 'pkjs'),
  icaljsTo: path.join(FIXTURE, 'targets', 'face', 'emit', 'ts', 'calendar', 'icaljs.js'),
  tsconfig: path.join(FIXTURE, 'targets', 'face', 'tsconfig.pkjs.json'),
  skipDir: path.join(FIXTURE_SRC, 'clay', 'builder'),
};

describe('findGenerated', () => {
  /** Everything it returns is a committed .g.js component, and plain modules are left to tsc. */
  test('returns only the committed .g.js components', () => {
    const result = findGenerated(FIXTURE_PATHS);

    expect(result).toEqual([path.join('clay', 'sample-component.g.js')]);
  });

  /**
   * clay/builder holds the pieces components are stitched from. They are bundled into
   * the .g.js already, so copying them would ship the sources twice.
   */
  test('skips a generated file inside clay/builder', () => {
    const result = findGenerated(FIXTURE_PATHS).filter((name) => name.split(path.sep).join('/').startsWith('clay/builder/'));

    expect(result).toEqual([]);
  });
});

// every real face the mounting repo holds, as the bare names facePaths takes
const FACE_NAMES = listFaces().map((rel) => path.basename(rel));

describe.skipIf(FACE_NAMES.length === 0)('findGenerated on every face', () => {
  FACE_NAMES.forEach((face) => {
    /** A name the copy cannot read, or a builder piece, throws mid-build or ships the sources twice. */
    test(`${face}: returns only .g.js files that exist under src/pkjs and outside clay/builder`, () => {
      const paths = facePaths(face);

      const result = findGenerated(paths).filter((name) => !name.endsWith('.g.js')
        || !fs.existsSync(path.join(paths.faceSrc, name))
        || name.split(path.sep).join('/').startsWith('clay/builder/'));

      expect(result).toEqual([]);
    });
  });
});
