/**
 * The page check fixture for a face that passes its own customClay.
 *
 * Its settings page is the `face/` fixture's, so the same rows fold away under the plugin choice.
 * Once Clay has built the page, its customClay marks the page with whether the framework's show and
 * hide had already hidden the weather key row, which it has when the page opens on the plugin. Then
 * it shows that row again, which tells the check a face's code can still change a row after the
 * framework's.
 */
import app from '../../../../../../ts/pkjs/app';
import weather from '../../../../../../ts/weather/feature';
import clayConfig from '../../../face/src/pkjs/config';

/** The bits of the Clay page this reaches. */
interface ClayPage {
  EVENTS: { AFTER_BUILD: string };
  on(event: string, handler: () => void): void;
  getItemByMessageKey(messageKey: string): { $element: HTMLElement[] } | undefined;
}

/** The face's own page code. Clay copies it into the page as text, so it reaches nothing outside itself. */
function customClay(this: ClayPage): void {
  this.on(this.EVENTS.AFTER_BUILD, () => {
    const keyRow = this.getItemByMessageKey('WEATHER_API_KEY');
    const element = keyRow ? keyRow.$element[0] : undefined;
    const hiddenAlready = Boolean(element) && (element as HTMLElement).classList.contains('hide');

    document.body.setAttribute('data-face-page-code', hiddenAlready ? 'after' : 'before');

    if (element) {
      element.classList.remove('hide');
    }
  });
}

app.startPebbleApp({
  clayConfig,
  customClay,
  features: [weather],
});
