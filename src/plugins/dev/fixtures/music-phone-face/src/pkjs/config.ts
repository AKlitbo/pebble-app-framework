/**
 * The settings page of the page check's now playing and phone battery fixture.
 *
 * Neither kind has a choice to make, so the page has no select for either. Its own Now Playing
 * section ends on a line marked for the music notes, so those land under it. Nothing is marked for
 * the phone, so its notes land at the foot of the page above the supported plugins panel.
 */
import { heading } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const clayConfig: ClayConfigItem[] = [
  heading('Page Check Music Phone'),
  {
    type: 'section',
    items: [
      heading('Now Playing'),
      {
        type: 'text',
        defaultValue: 'Add a Now Playing panel to your layout to see what your phone is playing.',
        pluginSourceRows: 'music',
      },
    ],
  },
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

export default clayConfig;
