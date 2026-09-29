import { sampleLabel } from './label';

/**
 * The fixture's init, the piece the generated wrapper calls.
 *
 * @return A ready label string for the sample component.
 */
export function init(): string {
  return sampleLabel('ready');
}
