/**
 * The phone's battery, as a feature a face opts into.
 *
 * It reads the level from the Pebble app's Phone plugin and sends it to the watch as
 * `PHONE_BATTERY`, a whole percent, -1 when there is no reading yet, or -2 while no plugin on the
 * phone serves it. The watch asks again with
 * `PHONE_REQUEST`. A face turns it on with `PLUGIN_PHONE` in its appinfo's defines and lists the
 * feature in startPebbleApp. All of the plugin code lives behind plugin-sources/index, so a face
 * built without the define reads null there and carries none of it. Listed without the define, the
 * feature logs why and does nothing.
 */
import { createDedupedSender } from '../pkjs/send-queue';
import type { Feature } from '../pkjs/feature';
import { phonePlugins } from '../plugin-sources/index';

/**
 * Starts the phone battery feature for a face.
 *
 * @param context What the app shares: the face's message keys and the send queue.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page, or none for a face built without `PLUGIN_PHONE`.
 */
const phone: Feature = (context) => {
  const { messageKeys, queueSend } = context;

  if (!phonePlugins) {
    console.warn('Phone: this face lists the phone feature but is built without PLUGIN_PHONE, so it reads no phone battery. Add "PLUGIN_PHONE": 1 to the defines in its appinfo');
    return {};
  }

  // the level the watch holds, so an update that moved something other than the battery, such as
  // the Wi-Fi, wakes nothing
  const sender = createDedupedSender(queueSend, 'Phone');

  return phonePlugins.driver(context, {
    send: (level) => sender.push({ [messageKeys.PHONE_BATTERY]: level }),
    forget: () => sender.forget(),
  });
};

export default phone;
