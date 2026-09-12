import { sampleLabel } from './label';

/** The fixture's init, the piece the generated wrapper calls. */
export function init(): string {
  return sampleLabel('ready');
}
