/**
 * A small recipe for the generator specs, laid out the way a face keeps its real ones.
 */

import type { Manifest } from '../../../../../../generate-components.ts';

export default {
  name: 'sampleBuilder',
  hookPrefix: '_sample',
  template: 'html/sample.html',
  styles: ['css/sample.css'],
  pieces: ['ts/sample/label', 'ts/sample/init'],
  output: 'src/pkjs/clay/sample-component.g.js',
  doc: ['Fixture component for the generator specs.'],
} satisfies Manifest;
