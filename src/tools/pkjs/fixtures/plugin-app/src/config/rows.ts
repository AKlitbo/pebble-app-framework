// a row the page imports from a file of its own, with no extension, the way the framework's own code
// imports, so the specs see the page config bundled rather than loaded file by file
// its default comes from the file the plugin's script shares, which reaches the iCal reader
import type { ClayConfigItem } from '../../../../../../ts/clay/types';
import { REFRESH_DEFAULT } from '../settings';

export const REFRESH_ROW: ClayConfigItem = {
  type: 'select',
  messageKey: 'REFRESH',
  label: 'Refresh Interval',
  defaultValue: REFRESH_DEFAULT,
  options: [{ label: '5 Minutes', value: '5' }, { label: '30 Minutes', value: '30' }],
};
