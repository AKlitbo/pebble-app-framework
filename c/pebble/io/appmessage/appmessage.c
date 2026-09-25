/**
 * @file appmessage.c
 * @brief AppMessage transport: weather requests out, settings + readings in. Decodes
 * the wire format and hands results to the app through handlers, so it never
 * reaches into the UI itself.
 *
 * @ingroup lib_io
 */
#include "io/appmessage/appmessage.h"

#include "io/callback_list.h"
#include "io/outbox_queue.h"
#include "io/tuple_read.h"
#include "math/scale.h"
#include "text/cstring_fit.h"
#include "system/settings/settings.h"
#include <limits.h>

// a face has weather when it declares all four of these. the watch asks with the first and reads a
// reading off the other three, so all four are one decision. the ok flag is the one that tells a
// failed fetch from a reading, and a face without it would show "NO GPS" as a live 0 degrees.
// a face that declares none opted out of weather and builds without it. a face that declares only
// some has a typo or a gap, which would otherwise build and go wrong on the watch, so the build
// stops and names each missing key
#if defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) && defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) && defined(HAS_MESSAGE_KEY_WEATHER_OK)
#define APPMESSAGE_HAS_WEATHER 1
#elif defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) || defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) || \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) || defined(HAS_MESSAGE_KEY_WEATHER_OK)
#if !defined(HAS_MESSAGE_KEY_WEATHER_REQUEST)
#error "weather needs WEATHER_REQUEST in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE)
#error "weather needs WEATHER_TEMPERATURE in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS)
#error "weather needs WEATHER_CONDITIONS in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_OK)
#error "weather needs WEATHER_OK in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#endif

/**
 * @var s_handlers
 * @brief The registered channel handlers. Each one stays NULL until a consumer opts in.
 */
static struct
{
    WeatherHandler              on_weather;             ///< Current conditions arrived
    CoordsHandler               on_coords;              ///< The phone's coordinates arrived
    SettingsChangedHandler      on_settings_changed;    ///< A settings push was applied
    WeatherExtraHandler         on_weather_extra;       ///< The extra weather readings arrived
    WeatherForecastHandler      on_weather_forecast;    ///< Today's forecast readings arrived
    WeatherAirHandler           on_weather_air;         ///< The air readings arrived
    WeatherForecastStripHandler on_forecast_hourly;     ///< The hourly forecast strip arrived
    WeatherForecastStripHandler on_forecast_daily;      ///< The daily forecast strip arrived
    LocationNameHandler         on_location_name;       ///< The location name arrived
    StockStripHandler           on_stock_strip;         ///< The stock strip arrived
    CalendarStripHandler        on_calendar_strip;      ///< The calendar strip arrived
    CustomColorsHandler         on_custom_colors;       ///< Custom colours arrived from the settings page
    CustomColorsProvider        custom_colors_provider; ///< Supplies the face's custom colours for the settings reply
} s_handlers;

/// Room for the work that waits for a whole inbound message, one entry per store that wants it
#define INBOX_COMPLETE_MAX 4

static CallbackListFn s_inbox_complete_entries[INBOX_COMPLETE_MAX]; ///< That work, in the order it was added
static CallbackList s_inbox_complete = {s_inbox_complete_entries, INBOX_COMPLETE_MAX, 0}; ///< The list over that storage

void appmessage_on_weather(WeatherHandler cb)                  { s_handlers.on_weather = cb; }
void appmessage_on_coords(CoordsHandler cb)                    { s_handlers.on_coords = cb; }
void appmessage_on_settings_changed(SettingsChangedHandler cb) { s_handlers.on_settings_changed = cb; }
void appmessage_on_weather_extra(WeatherExtraHandler cb)       { s_handlers.on_weather_extra = cb; }
void appmessage_on_weather_forecast(WeatherForecastHandler cb) { s_handlers.on_weather_forecast = cb; }
void appmessage_on_weather_air(WeatherAirHandler cb)          { s_handlers.on_weather_air = cb; }
void appmessage_on_weather_forecast_hourly(WeatherForecastStripHandler cb) { s_handlers.on_forecast_hourly = cb; }
void appmessage_on_weather_forecast_daily(WeatherForecastStripHandler cb)  { s_handlers.on_forecast_daily = cb; }
void appmessage_on_location_name(LocationNameHandler cb)       { s_handlers.on_location_name = cb; }
void appmessage_on_stock_strip(StockStripHandler cb)          { s_handlers.on_stock_strip = cb; }
void appmessage_on_calendar_strip(CalendarStripHandler cb)   { s_handlers.on_calendar_strip = cb; }
void appmessage_on_custom_colors(CustomColorsHandler cb)      { s_handlers.on_custom_colors = cb; }
void appmessage_set_custom_colors_provider(CustomColorsProvider cb) { s_handlers.custom_colors_provider = cb; }

void appmessage_add_inbox_complete(InboxCompleteHandler cb)
{
    // a full list means a store never commits what a message brought, so say so
    if (!callback_list_add(&s_inbox_complete, cb))
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "inbox complete list full, dropping a handler");
    }
}

/**
 * @name Outbox queue limits
 *
 * Only one AppMessage send can be in flight at a time, so every outbound message (the weather,
 * stock and calendar requests plus the settings reply) goes through one queue. It sends the head,
 * waits for its sent or failed callback, then sends the next, and drains a pass at a time.
 *
 * A request the phone nacks is held in a failed set and retried on a later pass. Its pkjs was
 * usually asleep, and that first send is often what wakes it. Holding it back means a whole poll is
 * not lost to one asleep-phone nack and left stale until the next interval.
 * @{
 */
#define REQUEST_RETRY_MAX 3          ///< Retry passes a nacked request gets before it is dropped
#define REQUEST_RETRY_DELAY_MS 5000  ///< Delay before the next retry pass, in ms
/** @} */

static OutboxQueue s_outbox;    ///< What is queued, what nacked, and what is in flight
static AppTimer *s_retry_timer; ///< Delay before the next retry pass
static uint32_t  s_outbox_size; ///< The outbox buffer size appmessage_open asked for

static void pump(void);
static uint32_t settings_reply_size(void);
static bool write_settings(DictionaryIterator *iter);

/**
 * @brief Build the message for @p kind and hand it to the outbox.
 *
 * @param kind The job kind to send.
 * @return False if the outbox refused it or a face does not declare the key for @p kind.
 */
static bool send_job(OutboxKind kind)
{
    DictionaryIterator *iter;
    if (app_message_outbox_begin(&iter) != APP_MSG_OK)
    {
        return false;
    }

    switch (kind)
    {
#if defined(APPMESSAGE_HAS_WEATHER)
        case OUTBOX_WEATHER:
            dict_write_uint8(iter, MESSAGE_KEY_WEATHER_REQUEST, 1);
            break;
#endif
#if defined(HAS_MESSAGE_KEY_STOCK_REQUEST)
        case OUTBOX_STOCK:
            dict_write_uint8(iter, MESSAGE_KEY_STOCK_REQUEST, 1);
            break;
#endif
#if defined(HAS_MESSAGE_KEY_CALENDAR_REQUEST)
        case OUTBOX_CALENDAR:
            dict_write_uint8(iter, MESSAGE_KEY_CALENDAR_REQUEST, 1);
            break;
#endif
        case OUTBOX_SETTINGS:
            if (!write_settings(iter))
            {
                // the outbox is opened at the reply's largest size, so this only happens when that
                // is more than the platform allows, which appmessage_open logs. the phone reads a
                // reply as the whole snapshot, and half of one would seed the config page with the
                // rest missing. so empty it, and still send it so the outbox is left ready
                const uint8_t *start = (const uint8_t *)iter->dictionary;
                dict_write_begin(iter, (uint8_t *)start, (uint16_t)((const uint8_t *)iter->end - start));
            }
            break;
        default:
            return false; // a face that doesn't declare the key never asks for that kind
    }

    return app_message_outbox_send() == APP_MSG_OK;
}

/**
 * @brief Add a job to the work queue unless its kind is already pending, then pump either way.
 *
 * @param kind The job kind to send.
 * @param retries Retry passes left if the first send nacks (0 for the settings reply).
 */
static void enqueue(OutboxKind kind, int retries)
{
    // outbox_push turns away a kind that is already waiting, so a poll that repeats keeps the one
    // already queued. the pump still runs, which only sends when the outbox is free
    outbox_push(&s_outbox, kind, retries);
    pump();
}

/**
 * @brief Move the whole failed set back into the work queue for another pass, then pump.
 *
 * @param data The timer context (unused).
 */
static void retry_pass(void *data)
{
    s_retry_timer = NULL;
    outbox_retry_pass(&s_outbox);
    pump();
}

/**
 * @brief Send the head job when the outbox is free, once the phone is there.
 */
static void pump(void)
{
    if (outbox_busy(&s_outbox))
    {
        return;
    }

    // nothing reaches a phone that isn't there. dump everything and let a store's next poll ask
    // again once it reconnects
    if (!connection_service_peek_pebble_app_connection())
    {
        outbox_clear(&s_outbox);
        if (s_retry_timer)
        {
            app_timer_cancel(s_retry_timer);
            s_retry_timer = NULL;
        }
        return;
    }

    // this pass is done: if any request failed, arm the next pass and stop
    if (s_outbox.queue_len == 0)
    {
        if (s_outbox.failed_len > 0 && !s_retry_timer)
        {
            s_retry_timer = app_timer_register(REQUEST_RETRY_DELAY_MS, retry_pass, NULL);
        }
        return;
    }

    if (send_job(s_outbox.queue[0].kind))
    {
        // taking the head is what marks the outbox busy, so it happens only once the send landed
        outbox_take_head(&s_outbox);
    }
    else
    {
        // the outbox refused it even though the phone is there (rare). hold it for a retry pass and
        // move on, so a stuck head can't wedge the queue
        outbox_hold_failed(&s_outbox, s_outbox.queue[0]);
        outbox_pop_front(&s_outbox);
        pump();
    }
}

void appmessage_request_weather(void)
{
#if defined(APPMESSAGE_HAS_WEATHER)
    enqueue(OUTBOX_WEATHER, REQUEST_RETRY_MAX);
#else
    // a face that starts the weather store live without declaring the keys asks on every poll and
    // never hears back, so say so once rather than leave the panels on placeholders with no clue
    static bool s_warned = false;
    if (!s_warned)
    {
        s_warned = true;
        APP_LOG(APP_LOG_LEVEL_WARNING, "Weather asked for, but this face declares no weather keys");
    }
#endif
}

void appmessage_request_stock(void)
{
#if defined(HAS_MESSAGE_KEY_STOCK_REQUEST)
    enqueue(OUTBOX_STOCK, REQUEST_RETRY_MAX);
#endif
}

void appmessage_request_calendar(void)
{
#if defined(HAS_MESSAGE_KEY_CALENDAR_REQUEST)
    enqueue(OUTBOX_CALENDAR, REQUEST_RETRY_MAX);
#endif
}

/**
 * @brief The most outbox bytes the settings reply could take, counting everything write_settings
 * writes. The outbox is opened at this, so no settings change can outgrow it later.
 *
 * @return The whole message's size, the dictionary's own header included.
 */
static uint32_t settings_reply_size(void)
{
    uint32_t size = dict_calc_buffer_size(0) + settings_serialized_size_max();

#if defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
    size += dict_calc_buffer_size(1, (uint32_t)sizeof(uint8_t)) - dict_calc_buffer_size(0);
#endif

#if defined(HAS_MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS)
    // counted whether or not a provider is set yet, so the order a face registers the provider and
    // opens the transport in makes no difference
    size += dict_calc_buffer_size(1, (uint32_t)APPMESSAGE_CUSTOM_COLORS_MAX) - dict_calc_buffer_size(0);
#endif

    return size;
}

#if defined(HAS_MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS)
/**
 * @brief Whether the custom colours a message carries are the ones the face already holds.
 *
 * The settings page sends the colours with every save, so taking each arrival as a change made
 * every save rebuild the face and refetch anything that follows a settings change. The face's own
 * provider rebuilds the string it holds, and the two only match when nothing moved. A string the
 * provider writes differently just counts as a change.
 *
 * @param custom The colours the message carries.
 * @return True when they match what the face holds.
 */
static bool custom_colors_match(const char *custom)
{
    if (!s_handlers.custom_colors_provider)
    {
        return false;
    }

    char held[APPMESSAGE_CUSTOM_COLORS_MAX];
    s_handlers.custom_colors_provider(held, sizeof(held));
    return strcmp(custom, held) == 0;
}
#endif

/**
 * @brief Write the settings reply payload into the outbox iterator.
 *
 * The watch persist is the source of truth so Clay can seed its store from it. Carries the current
 * settings, a fresh flag, and the custom colours. settings_reply_size counts the same three things.
 *
 * @param iter The outbox iterator to write into.
 * @return True when all of it was written, false when the outbox ran out of room partway.
 */
static bool write_settings(DictionaryIterator *iter)
{
    bool written = settings_serialize(iter);

    // tell the phone whether we booted with no saved settings (wiped by an install/update), so it
    // can push its own config back instead of letting these defaults seed over it
#if defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
    written = dict_write_uint8(iter, MESSAGE_KEY_SETTINGS_FRESH, settings_was_fresh() ? 1 : 0) == DICT_OK && written;
#endif

    // custom colours ride their own key (split across two persist blobs on the watch), so the
    // settings table does not carry them: the provider rebuilds the combined string into a stack
    // buffer that lives only for this send since dict_write_cstring copies it into the outbox
#if defined(HAS_MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS)
    if (s_handlers.custom_colors_provider)
    {
        char combined[APPMESSAGE_CUSTOM_COLORS_MAX];
        s_handlers.custom_colors_provider(combined, sizeof(combined));
        written = dict_write_cstring(iter, MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS, combined) == DICT_OK && written;
    }
#endif

    return written;
}

/**
 * @brief Queue the settings reply so it serialises with the data requests through the one outbox.
 */
static void send_settings(void)
{
    enqueue(OUTBOX_SETTINGS, 0);
}

// only a face with one of the byte strips calls this, and a face with none would warn it goes unused
#if defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_HOURLY) || defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_DAILY) || \
    defined(HAS_MESSAGE_KEY_STOCK_STRIP) || defined(HAS_MESSAGE_KEY_CALENDAR_STRIP)
/**
 * @brief Find a byte array tuple by key and hand its bytes to a handler.
 *
 * The forecast, stock, and calendar strips all ride as packed byte arrays through a
 * same-signature handler, so one dispatcher covers them. The handler comes in as an argument
 * rather than a table, so it stays out of the binary's .data section.
 *
 * @param iter The dictionary iterator to search.
 * @param key The message key to look up.
 * @param cb The handler to call with the raw bytes, or NULL to do nothing.
 */
static void dispatch_bytes(DictionaryIterator *iter, uint32_t key,
                           void (*cb)(const uint8_t *data, uint16_t len))
{
    if (!cb)
    {
        return;
    }
    Tuple *tuple = dict_find(iter, key);
    if (tuple && tuple->type == TUPLE_BYTE_ARRAY)
    {
        cb(tuple->value->data, tuple->length);
    }
}
#endif

/**
 * @brief Apply an inbox message: weather, coords, and any changed settings.
 *
 * @param iterator The dictionary iterator containing the message.
 * @param context Application context (unused).
 */
static void inbox_received_callback(DictionaryIterator *iterator, void *context)
{
    // the phone asks for the watch's settings on launch to seed Clay so reply and stop
    if (dict_find(iterator, MESSAGE_KEY_SETTINGS_REQUEST))
    {
        send_settings();
        return;
    }

    // a face that opts out of weather leaves this whole block out with its keys
#if defined(APPMESSAGE_HAS_WEATHER)
    Tuple *temp_tuple = dict_find(iterator, MESSAGE_KEY_WEATHER_TEMPERATURE);
    Tuple *conditions_tuple = dict_find(iterator, MESSAGE_KEY_WEATHER_CONDITIONS);
    Tuple *wx_ok_tuple = dict_find(iterator, MESSAGE_KEY_WEATHER_OK);

    // the payload is phone-controlled so everything here reads through the tuple helpers above.
    // they check the width as well as the type, which the type on its own cannot do: the SDK
    // sizes an int by its length and packs the tuples back to back, so reading int32 off a
    // narrower one picks up the next tuple's key
    const char *conditions = tuple_str_or(conditions_tuple, NULL);
    bool temp_is_int = temp_tuple && (temp_tuple->type == TUPLE_INT || temp_tuple->type == TUPLE_UINT);

    if (temp_is_int && conditions)
    {
        // only a flag that reads as 1 makes this a real reading. a missing or malformed one keeps it
        // on the unavailable side, so a failed fetch's status text never shows as a live 0 degrees
        bool wx_ok = wx_ok_tuple && tuple_int_or(wx_ok_tuple, 0) == 1;

        static char conditions_buffer[32];

        cstring_fit(conditions_buffer, conditions, sizeof(conditions_buffer));

        if (wx_ok)
        {
            int temp_value = tuple_int_or(temp_tuple, 0);
            // clamp to a sane range so a corrupt reading can't display absurdly or overflow the
            // store's int16 field. the face turns the number into "23°C"/"23°F" when it draws
            temp_value = clamp_int(temp_value, -99, 199);

            if (s_handlers.on_weather)
            {
                s_handlers.on_weather(temp_value, conditions_buffer);
            }
        }
        else
        {
            // no live reading (e.g. no location set or network error). the NULL cond tells the
            // store to keep its last good reading rather than blank out (the temp is ignored)
            APP_LOG(APP_LOG_LEVEL_INFO, "Weather Unavailable: %s", conditions_buffer);
            if (s_handlers.on_weather)
            {
                s_handlers.on_weather(0, NULL);
            }
        }
    }
#endif

    // extra weather readings only for faces that declare the keys
    // the keys are absent from other faces' message_keys so guard the whole block
    // on the generated #defines to keep the shared transport compiling everywhere
#if defined(HAS_MESSAGE_KEY_WEATHER_HUMIDITY) && defined(HAS_MESSAGE_KEY_WEATHER_WIND_SPEED) && \
    defined(HAS_MESSAGE_KEY_WEATHER_WIND_DIR) && defined(HAS_MESSAGE_KEY_WEATHER_SUNRISE) && defined(HAS_MESSAGE_KEY_WEATHER_SUNSET)
    if (s_handlers.on_weather_extra)
    {
        Tuple *humidity_t = dict_find(iterator, MESSAGE_KEY_WEATHER_HUMIDITY);
        Tuple *wind_spd_t = dict_find(iterator, MESSAGE_KEY_WEATHER_WIND_SPEED);
        Tuple *wind_dir_t = dict_find(iterator, MESSAGE_KEY_WEATHER_WIND_DIR);
        Tuple *sunrise_t = dict_find(iterator, MESSAGE_KEY_WEATHER_SUNRISE);
        Tuple *sunset_t = dict_find(iterator, MESSAGE_KEY_WEATHER_SUNSET);

        // these keys only ride a weather message so any one present marks it as one
        if (humidity_t || wind_spd_t || wind_dir_t || sunrise_t || sunset_t)
        {
            int humidity = tuple_int_or(humidity_t, -1);
            int wind_kmh = tuple_int_or(wind_spd_t, -1);
            const char *wind_dir = tuple_str_or(wind_dir_t, "");
            const char *sunrise = tuple_str_or(sunrise_t, "");
            const char *sunset = tuple_str_or(sunset_t, "");

            s_handlers.on_weather_extra(humidity, wind_kmh, wind_dir, sunrise, sunset);
        }
    }
#endif

    // daily forecast bits (uv now plus today's high/low plus precip chance) same opt-in guard.
    // absent fields ride out as INT_MIN so a real negative temperature is never mistaken
    // for no-data (unlike the -1 the extra readings use)
#if defined(HAS_MESSAGE_KEY_WEATHER_UV_INDEX) && defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MAX) && \
    defined(HAS_MESSAGE_KEY_WEATHER_TEMP_MIN) && defined(HAS_MESSAGE_KEY_WEATHER_PRECIP_CHANCE)
    if (s_handlers.on_weather_forecast)
    {
        Tuple *uv_t = dict_find(iterator, MESSAGE_KEY_WEATHER_UV_INDEX);
        Tuple *tmax_t = dict_find(iterator, MESSAGE_KEY_WEATHER_TEMP_MAX);
        Tuple *tmin_t = dict_find(iterator, MESSAGE_KEY_WEATHER_TEMP_MIN);
        Tuple *pchance_t = dict_find(iterator, MESSAGE_KEY_WEATHER_PRECIP_CHANCE);

        if (uv_t || tmax_t || tmin_t || pchance_t)
        {
            int uv = tuple_int_or(uv_t, INT_MIN);
            int temp_max = tuple_int_or(tmax_t, INT_MIN);
            int temp_min = tuple_int_or(tmin_t, INT_MIN);
            int precip_chance = tuple_int_or(pchance_t, INT_MIN);

            s_handlers.on_weather_forecast(uv, temp_max, temp_min, precip_chance);
        }
    }
#endif

    // air readings (feels-like plus surface pressure plus dew point). same opt-in guard,
    // absent fields ride out as INT_MIN so a real negative temperature is never no-data
#if defined(HAS_MESSAGE_KEY_WEATHER_FEELS_LIKE) && defined(HAS_MESSAGE_KEY_WEATHER_PRESSURE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_DEW_POINT)
    if (s_handlers.on_weather_air)
    {
        Tuple *feels_t = dict_find(iterator, MESSAGE_KEY_WEATHER_FEELS_LIKE);
        Tuple *pressure_t = dict_find(iterator, MESSAGE_KEY_WEATHER_PRESSURE);
        Tuple *dew_t = dict_find(iterator, MESSAGE_KEY_WEATHER_DEW_POINT);

        if (feels_t || pressure_t || dew_t)
        {
            int feels_like = tuple_int_or(feels_t, INT_MIN);
            int pressure = tuple_int_or(pressure_t, INT_MIN);
            int dew_point = tuple_int_or(dew_t, INT_MIN);

            s_handlers.on_weather_air(feels_like, pressure, dew_point);
        }
    }
#endif

    // the forecast, stock, and calendar strips ride as packed byte arrays. each is opt-in via its
    // own key, and the store owns the wire format, so we just hand the raw bytes on
#if defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_HOURLY)
    dispatch_bytes(iterator, MESSAGE_KEY_WEATHER_FORECAST_HOURLY, s_handlers.on_forecast_hourly);
#endif
#if defined(HAS_MESSAGE_KEY_WEATHER_FORECAST_DAILY)
    dispatch_bytes(iterator, MESSAGE_KEY_WEATHER_FORECAST_DAILY, s_handlers.on_forecast_daily);
#endif
#if defined(HAS_MESSAGE_KEY_STOCK_STRIP)
    dispatch_bytes(iterator, MESSAGE_KEY_STOCK_STRIP, s_handlers.on_stock_strip);
#endif
#if defined(HAS_MESSAGE_KEY_CALENDAR_STRIP)
    dispatch_bytes(iterator, MESSAGE_KEY_CALENDAR_STRIP, s_handlers.on_calendar_strip);
#endif

    // coordinates arrive pre-formatted as dash strings like "33-44" and "-112-07". a fix is the
    // pair, so both keys have to be there. one on its own would hand the store an empty string
    // for the other half and blank a good coordinate
#if defined(HAS_MESSAGE_KEY_LOCATION_LATITUDE) && defined(HAS_MESSAGE_KEY_LOCATION_LONGITUDE)
    Tuple *lat_t = dict_find(iterator, MESSAGE_KEY_LOCATION_LATITUDE);
    Tuple *lon_t = dict_find(iterator, MESSAGE_KEY_LOCATION_LONGITUDE);
    if (lat_t && lon_t && s_handlers.on_coords)
    {
        const char *lat = tuple_str_or(lat_t, "");
        const char *lon = tuple_str_or(lon_t, "");
        s_handlers.on_coords(lat, lon);
    }
#endif

#if defined(HAS_MESSAGE_KEY_LOCATION_NAME)
    Tuple *loc_name_t = dict_find(iterator, MESSAGE_KEY_LOCATION_NAME);
    if (s_handlers.on_location_name)
    {
        const char *loc_name = tuple_str_or(loc_name_t, "");
        if (loc_name[0] != '\0' && loc_name[0] != '{')
        {
            s_handlers.on_location_name(loc_name);
        }
    }
#endif

    // custom colours ride their own key, not the settings table: the combined "~3 colours | flags"
    // string can exceed a persist key, so read it straight off the tuple and let the face split +
    // store it into the two blobs
    bool custom_changed = false;
#if defined(HAS_MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS)
    Tuple *custom_colors_t = dict_find(iterator, MESSAGE_KEY_APPEARANCE_CUSTOM_COLORS);
    if (custom_colors_t && s_handlers.on_custom_colors)
    {
        // this string gets split straight into the two persist blobs, so an unterminated one
        // would carry whatever followed it in the inbox all the way into flash
        const char *custom = tuple_str_or(custom_colors_t, NULL);
        if (custom && !custom_colors_match(custom))
        {
            s_handlers.on_custom_colors(custom);
            custom_changed = true;
        }
    }
#endif

    // decode every settings field the message carries. the table owns which keys
    // exist and how each encodes so this transport never names a field
    SettingsInbound settings = settings_apply_inbox(iterator);
    bool moved = settings.changed || custom_changed;

    bool save = moved;
#if defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
    // the phone marks a save or a restore from its settings page by sending SETTINGS_FRESH along
    // with it. while the watch is fresh only that message writes to flash, and it always does, since
    // the key existing is what stops the watch asking to be restored on the next launch.
    // anything else that lands first stays in memory. the time zone push on every ready carries a
    // settings field too, and saving it would end fresh before the restore arrived. the phone would
    // then see a watch with settings and never restore it
    bool page = dict_find(iterator, MESSAGE_KEY_SETTINGS_FRESH) != NULL;
    if (settings_was_fresh())
    {
        save = page;
    }
#endif

    if (save)
    {
        settings_save();
    }

#if defined(HAS_MESSAGE_KEY_SETTINGS_FRESH)
    if (page)
    {
        settings_mark_restored();
    }
#endif

    if (moved)
    {
        if (s_handlers.on_settings_changed)
        {
            s_handlers.on_settings_changed(settings.layout_changed);
        }

        if (settings.weather_changed)
        {
            appmessage_request_weather();
        }
    }

    // the whole message is dispatched: let a store that took several channels commit them
    // once (the weather store repaints and saves once here rather than once per channel)
    callback_list_fire(&s_inbox_complete);
}

/**
 * @brief Log a dropped inbox message.
 *
 * @param reason The reason the message was dropped.
 * @param context Application context (unused).
 */
static void inbox_dropped_callback(AppMessageResult reason, void *context)
{
    // a message bigger than the inbox is dropped whole with APP_MSG_BUFFER_OVERFLOW, which is the
    // sign a face's inbox size is too small for its settings page
    APP_LOG(APP_LOG_LEVEL_ERROR, "Message dropped: %d", (int)reason);
}

/**
 * @brief Outbox send was nacked (usually the phone's pkjs is asleep).
 *
 * Frees the outbox and holds a real request for a later retry pass, then pumps the rest of the
 * queue. The settings reply is not held.
 *
 * @param iter The dictionary iterator.
 * @param reason The reason the message failed.
 * @param context Application context (unused).
 */
static void outbox_failed_callback(DictionaryIterator *iter, AppMessageResult reason, void *context)
{
    APP_LOG(APP_LOG_LEVEL_WARNING, "Outbox failed: %d", (int)reason);

    // the in-flight send is done (nacked). hold a real request for a later retry pass, then carry
    // on with the queue. the send often wakes an asleep pkjs so the next pass tends to land.
    // outbox_release hands back what was in flight as it frees the slot, so the kind hold_failed
    // reads is the nacked job's rather than the cleared one's
    outbox_hold_failed(&s_outbox, outbox_release(&s_outbox));
    pump();
}

/**
 * @brief Outbox delivered. Frees the outbox and sends the next queued job.
 *
 * @param iter The dictionary iterator.
 * @param context Application context (unused).
 */
static void outbox_sent_callback(DictionaryIterator *iter, void *context)
{
    // the in-flight send landed, so free the outbox and send the next queued job
    outbox_release(&s_outbox);
    pump();
}

void appmessage_open(uint32_t inbox_size)
{
    app_message_register_inbox_received(inbox_received_callback);
    app_message_register_inbox_dropped(inbox_dropped_callback);
    app_message_register_outbox_failed(outbox_failed_callback);
    app_message_register_outbox_sent(outbox_sent_callback);

    // the biggest thing the watch sends is the settings reply, and every string in it is counted at
    // its full buffer, so no settings change can outgrow the outbox later. a face with no settings
    // at all still needs room for a one byte request
    uint32_t outbox_size = settings_reply_size();
    uint32_t request_size = dict_calc_buffer_size(1, (uint32_t)sizeof(uint8_t));
    if (outbox_size < request_size)
    {
        outbox_size = request_size;
    }

    // both buffers come off the heap, and the platform maximum is the most the SDK will open
    uint32_t outbox_max = app_message_outbox_size_maximum();
    uint32_t inbox_max = app_message_inbox_size_maximum();
    s_outbox_size = outbox_size < outbox_max ? outbox_size : outbox_max;
    if (outbox_size > outbox_max)
    {
        // a settings table this big could write a reply the outbox cannot hold, and one that
        // does not fit goes out empty
        APP_LOG(APP_LOG_LEVEL_ERROR, "settings reply %d over outbox %d", (int)outbox_size, (int)outbox_max);
    }
    // an inbox under the SDK minimum would drop every message the phone sends
    inbox_size = (uint32_t)clamp_int((int)inbox_size, APP_MESSAGE_INBOX_SIZE_MINIMUM, (int)inbox_max);

    // a failed open leaves every message in both directions going nowhere, so say so rather than
    // leave the panels on placeholders with no clue why
    AppMessageResult result = app_message_open(inbox_size, s_outbox_size);
    if (result != APP_MSG_OK)
    {
        APP_LOG(APP_LOG_LEVEL_ERROR, "open failed %d in %d out %d",
                (int)result, (int)inbox_size, (int)s_outbox_size);
    }
}
