/**
 * The most instances a source can be asked for, in a file of its own with nothing else in it, so the
 * iCal reader and the plugin source drivers can name it without pulling in the plugin runtime's types.
 */

/**
 * The most instances a `limit` can ask a source for, as the Pebble app takes it. A source asked for
 * more is cut to this, so a reader never needs to hold more than this many.
 */
export const SOURCE_LIMIT_MAX = 200;

export default { SOURCE_LIMIT_MAX };
