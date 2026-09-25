/**
 * @file appmessage.h
 * @brief AppMessage transport. Decodes the inbox and notifies the app through per-channel
 * handlers, and queues the outbound weather, stock, and calendar requests through one outbox.
 *
 * @ingroup lib_io
 */
#pragma once
#include <pebble.h>

#include "weather/weather_reading.h"

/**
 * @addtogroup lib_io
 * @{
 */

// per-channel handler types. a store or a face registers only the channels it cares about, so
// the appmessage pipeline stays separate from who reads the data

/**
 * @brief Called with one weather message, holding every group of readings it carried.
 *
 * The message is read straight off the inbox, so it only lives for this call. The pipeline does
 * not know the unit label. The face adds "°C" or "°F" from its own setting when it draws.
 *
 * @param msg The message. weather_reading_apply turns it into the kept reading.
 */
typedef void (*WeatherHandler)(const WeatherMessage *msg);

/**
 * @brief Called with a fresh pair of coordinates.
 *
 * @param lat Latitude, pre-formatted as a dash string like "33-44".
 * @param lon Longitude, pre-formatted as a dash string like "-112-07".
 */
typedef void (*CoordsHandler)(const char *lat, const char *lon);

/**
 * @brief Called after a settings save that changed something.
 *
 * @param time_or_date_changed True when the date or time format changed, so the face should
 *   re-render the clock.
 */
typedef void (*SettingsChangedHandler)(bool time_or_date_changed);

/**
 * @brief Called when the wearer switches the temperature unit on the settings page.
 *
 * Not called for a restore, which brings the unit any reading already on the watch was fetched in.
 *
 * @param fahrenheit True when the new unit is Fahrenheit.
 */
typedef void (*UnitChangedHandler)(bool fahrenheit);

/**
 * @brief Called with a packed watchlist strip. The handler owns the wire format.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 */
typedef void (*StockStripHandler)(const uint8_t *buf, uint16_t len);

/**
 * @brief Called with a packed agenda strip. The store owns the wire format.
 *
 * @param buf The raw wire bytes.
 * @param len How many bytes there are.
 */
typedef void (*CalendarStripHandler)(const uint8_t *buf, uint16_t len);

// the custom-colours string can be too big for one persist key, so it rides its own handler
// instead of the settings table. inbound the face splits it and stores it. outbound the
// provider rebuilds it into the buffer appmessage hands over, so nobody keeps a worst-case
// buffer alive between sends

/**
 * @brief Called inbound with the combined custom-colours string, for the face to split and store.
 *
 * @param combined The combined string, such as "3 colours | flags".
 */
typedef void (*CustomColorsHandler)(const char *combined);

/**
 * @brief Called outbound to rebuild the combined custom-colours string before a settings reply
 * is sent.
 *
 * @param[out] out The buffer to fill.
 * @param n The size of @p out.
 */
typedef void (*CustomColorsProvider)(char *out, size_t n);

/// Worst case combined custom-colours string. Two persist-key-sized halves plus the bar and the NUL
#define APPMESSAGE_CUSTOM_COLORS_MAX 502

/**
 * @brief Called once after every inbox message is fully handled.
 *
 * Lets a store that took several channels in one push save them together in one write, rather
 * than once per channel.
 */
typedef void (*InboxCompleteHandler)(void);

void appmessage_on_weather(WeatherHandler cb);                   /**< @brief One weather message, every group it carried */
void appmessage_on_coords(CoordsHandler cb);                     /**< @brief Latitude and longitude */
void appmessage_on_settings_changed(SettingsChangedHandler cb);  /**< @brief A setting changed on the phone */
void appmessage_on_unit_changed(UnitChangedHandler cb);          /**< @brief The wearer switched the temperature unit */
void appmessage_on_stock_strip(StockStripHandler cb);            /**< @brief Packed watchlist strip */
void appmessage_on_calendar_strip(CalendarStripHandler cb);      /**< @brief Packed agenda strip */
void appmessage_on_custom_colors(CustomColorsHandler cb);        /**< @brief Inbound: splits and stores the combined string */
void appmessage_set_custom_colors_provider(CustomColorsProvider cb); /**< @brief Outbound: rebuilds the combined string */
/**
 * @brief Adds work to run once after a whole inbound message is handled, after every channel in it.
 *
 * Unlike the channel handlers, this adds to a list rather than replacing a handler, so several
 * stores can each commit what one message brought them. Adding the same function twice does
 * nothing.
 *
 * @param cb The work to run. NULL is ignored.
 */
void appmessage_add_inbox_complete(InboxCompleteHandler cb);

/**
 * @brief Register the SDK callbacks and open the inbox and outbox.
 *
 * Call after settings_init and after the channel handlers are installed. The outbox is sized from
 * the face's settings table, counting every string at its full buffer, so it needs nothing from the
 * face.
 *
 * The inbox is the face's to size, because the biggest message in is the settings page's save and
 * Clay sends every message key in it, including ones the watch never reads. Add up the longest
 * value each key on the settings page can hold plus 7 bytes of header per key, and leave some room
 * over. A message bigger than the inbox is dropped whole and logged with its reason, so a settings
 * save that never lands is the sign the number is too small.
 *
 * @param inbox_size The inbox buffer in bytes. Anything over the platform maximum opens at the
 *   maximum.
 */
void appmessage_open(uint32_t inbox_size);

/**
 * @brief Asks the phone for a fresh weather reading. The weather store calls this on its
 * turn on the shared cadence. On a face that does not declare the weather keys it sends
 * nothing and logs one warning the first time it is called. The weather keys are
 * WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK, and a face that
 * declares only some of them fails to build, with each missing one named.
 */
void appmessage_request_weather(void);

/**
 * @brief Asks the phone for fresh quotes. The stock store calls this on its turn on the
 * shared cadence.
 * Does nothing on faces that do not declare the stock keys.
 */
void appmessage_request_stock(void);

/**
 * @brief Asks the phone for a fresh agenda. The calendar store calls this on its turn on the
 * shared cadence. Does nothing on faces that do not declare the calendar keys.
 */
void appmessage_request_calendar(void);

/** @} */
