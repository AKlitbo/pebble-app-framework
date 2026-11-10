/**
 * The providers a face offers, the one way into this folder for the rest of the phone code.
 *
 * The phone build writes its own copy of this file in place of the compiled one, for a face whose
 * appinfo lists providers that change something on the phone. That copy hands the face's lists to
 * narrow.ts and exports what it makes of them. A face that lists none keeps this file as it is, so
 * its `faceProviders` is null and narrow.ts never reaches its bundle.
 *
 * That copy writes the named export alone, so this file has no default export. One here would read
 * as undefined on the phone. Anything outside the folder reaches narrow.ts with `import type` only,
 * since a value import would survive the swap as a require for a file a face without providers does
 * not carry.
 */

import type { FaceProviders } from './narrow';

/** The providers this face offers, written in by the build. Null for a face whose appinfo lists none. */
export const faceProviders: FaceProviders | null = null;
