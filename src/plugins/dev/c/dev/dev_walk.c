/**
 * @file dev_walk.c
 * @brief The shared dev harness. It seeds the stores from a fixed fixture, or from the unit's
 * paf.dev.config.json for a store the config seeds, and drives the theme walk or a walk the config
 * lays out. Compiled for any face that lists the dev plugin, and the linker drops it from any face
 * that never calls it, which is every release build.
 *
 * @ingroup lib_dev
 */
#include "dev/dev_walk.h"
#include "dev/dev_config.h"

#include <time.h>

#include "io/stores/time_store.h"
#include "io/stores/weather_store.h"
#include "io/stores/health_store.h"
#include "io/stores/system_store.h"
#include "io/stores/location_store.h"
#include "io/stores/stock_store.h"
#include "io/stores/calendar_store.h"
#include "io/stores/phone_store.h"
#include "io/stores/music_store.h"
#include "io/appmessage/appmessage_features.h"
#include "system/settings/settings.h"
#include "ui/engine/engine.h"

/**
 * @var s_fixed
 * @brief The readings no shot varies, and where the watch is.
 */
static const struct
{
    int calories;     ///< Calorie count
    int sleep_min;    ///< Minutes slept
    int active_min;   ///< Active minutes
    int distance_m;   ///< Distance walked, in metres
    const char *lat;  ///< Latitude as the text the location store holds, such as "33-44"
    const char *lon;  ///< Longitude as the same kind of text
} s_fixed = {
    .calories = 420, .sleep_min = 431, .active_min = 52, .distance_m = 5300,
    .lat = "33-44", .lon = "-112-07",
};

/**
 * @brief One screenshot's worth of state, so a walk of eight themes is not eight shots of the
 * same numbers.
 *
 * A contact sheet of identical readings shows the palette and nothing else, and it reads as a
 * mock rather than as eight watches. These carry the things the chrome and the scene actually
 * show: what the weather is doing, how full the battery is, whether the phone is connected, and
 * whether the Quiet Time mark is up. The clock stays on the face's own pinned time in every shot,
 * so a panel that builds its own time agrees with the rest.
 */
typedef struct
{
    int16_t     temp;       ///< Temperature reading, in Celsius
    const char *cond;       ///< Weather condition code, such as `PCLDY`
    int         hr;         ///< Heart rate reading
    int         steps;      ///< Step count
    int         battery;    ///< Battery percentage
    bool        bluetooth;  ///< Whether the phone is connected
    bool        quiet_icon; ///< Whether the Quiet Time mark is up
} DevShot;

/**
 * @brief The shots a theme walk steps through. The first is also what a face shows with no walk.
 *
 * They cover the range rather than falling at random, with a flat battery and a full one, a
 * dropped phone, the Quiet Time mark up and down, and a range of weather so the scene is not
 * drawing the same sky eight times.
 */
static const DevShot s_shots[] = {
    {.temp = 21, .cond = "PCLDY", .hr = 72, .steps = 8431,  .battery = 64,  .bluetooth = true,  .quiet_icon = false},
    {.temp = 3,  .cond = "SNOW",  .hr = 58, .steps = 12045, .battery = 92,  .bluetooth = true,  .quiet_icon = true},
    {.temp = -8, .cond = "CLEAR", .hr = 61, .steps = 3120,  .battery = 41,  .bluetooth = false, .quiet_icon = false},
    {.temp = 31, .cond = "CLEAR", .hr = 88, .steps = 15680, .battery = 17,  .bluetooth = true,  .quiet_icon = true},
    {.temp = 14, .cond = "DRZL",  .hr = 66, .steps = 6402,  .battery = 78,  .bluetooth = true,  .quiet_icon = false},
    {.temp = 27, .cond = "CLDY",  .hr = 74, .steps = 9310,  .battery = 8,   .bluetooth = false, .quiet_icon = true},
    {.temp = 9,  .cond = "FOGGY", .hr = 55, .steps = 4870,  .battery = 100, .bluetooth = true,  .quiet_icon = false},
    {.temp = 35, .cond = "PCLDY", .hr = 91, .steps = 11250, .battery = 53,  .bluetooth = true,  .quiet_icon = true},
};

static DevWalkMode s_mode;          ///< Which walk is running
static void (*s_apply_theme)(void); ///< The face's theme-apply hook, run before the engine rebuilds
static uint8_t s_theme;             ///< The theme the walk is on
static uint16_t s_step;             ///< The step a walk the config lays out is on
static int s_hour;                  ///< The hour the face pinned the clock to
static int s_minute;                ///< The minute the face pinned the clock to

#if defined(APPMESSAGE_HAS_WEATHER)
/**
 * @brief A shot's temperature in the wearer's unit, rounded the way the weather store converts a
 * reading, so the number matches the C or F the readout puts beside it.
 *
 * A seed is drawn as written, so this runs on every seed and every tap draws the same numbers.
 *
 * @param celsius The shot's temperature, in Celsius.
 * @return The temperature in the unit the settings hold.
 */
static int16_t shot_temp(int16_t celsius)
{
    if (!settings_u8(SETTING_TEMPERATURE_UNIT))
    {
        return celsius;
    }

    // nearest whole degree, halves away from zero
    int scaled = celsius * 9;
    return (int16_t)((scaled + (scaled < 0 ? -2 : 2)) / 5 + 32);
}
#endif

/**
 * @brief Seed the clock, weather, health, and system stores from one shot. A face without weather
 * gets an empty weather store, so it never boots the harness with a reading it cannot show.
 *
 * Every store here starts with live off, which lets go of any channel, service, or link listener a
 * live start took and takes none of its own, so seeding again on a tap re-seeds rather than stacking
 * handlers. The weather seed is in the wearer's unit as the settings hold it at the time.
 *
 * A store the unit's paf.dev.config.json seeds takes the config's readings rather than the shot's, on
 * every shot, so the theme walk only moves the stores the config leaves to the fixture. The clock
 * takes the config's date too when it pins one.
 *
 * @param shot The shot to seed from.
 */
static void seed_shot(const DevShot *shot);

/**
 * @brief Seed the weather store from one shot.
 *
 * @param shot The shot to seed from.
 */
static void seed_shot_weather(const DevShot *shot);

static void seed_shot(const DevShot *shot)
{
    // the pinned clock, never ticking
    time_t now = time(NULL);
    struct tm pinned = *localtime(&now);
    pinned.tm_hour = s_hour;
    pinned.tm_min = s_minute;
    pinned.tm_sec = 0;
    dev_config_pin(&pinned);
    time_store_init((TimeConfig){.live = false, .minute_tick = false, .beats = false}, &pinned);

    if (!dev_config_seed(DEV_STORE_WEATHER))
    {
        seed_shot_weather(shot);
    }

    if (!dev_config_seed(DEV_STORE_HEALTH))
    {
        HealthSeed health = {.hr = shot->hr, .steps = shot->steps, .calories = s_fixed.calories,
                             .sleep_min = s_fixed.sleep_min, .active_min = s_fixed.active_min,
                             .distance_m = s_fixed.distance_m};
        health_store_init((HealthConfig){.live = false}, &health);
    }

    if (!dev_config_seed(DEV_STORE_SYSTEM))
    {
        SystemSeed system = {.battery = shot->battery, .charging = false, .bluetooth = shot->bluetooth};
        system_store_init((SystemConfig){.live = false, .vibe = NULL}, &system);
    }
}

static void seed_shot_weather(const DevShot *shot)
{
#if defined(APPMESSAGE_HAS_WEATHER)
    // spread the empty seed so every reading the shot does not set (humidity, wind, uv, ...)
    // reads as "--" rather than a bogus 0
    // the seed is copied from a named constant, which gets a section of its own that the linker
    // drops with this function in a release build. the macro written straight into wx leaves an
    // unnamed copy in the file's shared .data, which the SDK's linker keeps in every build
    static const WeatherSeed s_empty = WEATHER_SEED_EMPTY;
    WeatherSeed wx = s_empty;
    wx.temp = shot_temp(shot->temp);
    wx.cond = shot->cond;
    weather_store_init((WeatherConfig){.live = false, .poll_min = 0}, &wx);
#else
    // a face without weather can still link a weather readout, so the store is set up empty and
    // every reading shows dashes rather than the zeros an untouched store holds
    (void)shot;
    weather_store_init((WeatherConfig){.live = false, .poll_min = 0}, NULL);
#endif
}

/**
 * @brief Move the walk onto one shot, Quiet Time mark included.
 *
 * @param index Which shot, wrapped to the table.
 */
static void apply_shot(uint8_t index)
{
    const DevShot *shot = &s_shots[index % ARRAY_LENGTH(s_shots)];

    seed_shot(shot);

    // this does nothing on a face that never subscribed to the id
    // that is fine, since it only moves for the faces that actually draw the mark
    settings_set_u8(SETTING_QUIET_TIME_ICON, shot->quiet_icon ? 1 : 0);
}

/**
 * @brief Accelerometer tap: advance the active walk by one.
 *
 * @param axis The tap axis (unused).
 * @param direction The tap direction (unused).
 */
static void tap_handler(AccelAxisType axis, int32_t direction)
{
    if (s_mode == DEV_WALK_CONFIG)
    {
        uint16_t count = dev_config_walk_count();
        s_step = count ? (uint16_t)((s_step + 1) % count) : 0;

        // a step that switches the temperature unit seeds the weather again, the way a launch applies
        // the settings before it seeds, so the readings match the new unit
        if (dev_config_walk_show(s_step) && !dev_config_seed(DEV_STORE_WEATHER))
        {
            seed_shot_weather(&s_shots[0]);
        }

        if (s_apply_theme) s_apply_theme();
        engine_rebuild();
    }
    else if (s_mode == DEV_WALK_THEMES)
    {
        uint8_t count = settings_enum_count(SETTING_THEME);
        s_theme = count ? (s_theme + 1) % count : 0;
        settings_set_u8(SETTING_THEME, s_theme);
        // the data moves with the theme, so a sheet of every palette is also a sheet of every
        // battery level, both bluetooth states and a range of weather
        apply_shot(s_theme);
        if (s_apply_theme) s_apply_theme();
        engine_rebuild();
    }
}

void dev_walk_seed_stores(int hour, int min)
{
    s_hour = hour;
    s_minute = min;

    seed_shot(&s_shots[0]);

    if (!dev_config_seed(DEV_STORE_LOCATION))
    {
#if defined(APPMESSAGE_HAS_LOCATION)
        LocationSeed location = {.lat = s_fixed.lat, .lon = s_fixed.lon};
        location_store_init((LocationConfig){.live = false}, &location);
#else
        location_store_init((LocationConfig){.live = false}, NULL);
#endif
    }

    // the stock and calendar stores start empty and pinned, so a settings save that reconfigures
    // them live leaves them alone rather than fetching real quotes and agendas. a face without their
    // keys skips them here, so the harness never drags their buffers into its dev build
#if defined(HAS_MESSAGE_KEY_STOCK_STRIP)
    if (!dev_config_seed(DEV_STORE_STOCKS))
    {
        stock_store_init((StockConfig){.live = false, .poll_min = 0}, NULL);
    }
#endif
#if defined(HAS_MESSAGE_KEY_CALENDAR_STRIP)
    if (!dev_config_seed(DEV_STORE_CALENDAR))
    {
        calendar_store_init((CalendarConfig){.live = false, .poll_min = 0}, NULL);
    }
#endif

    // the phone battery and now playing stores start empty and pinned too. the seeded system store
    // hears no link change, so a live one would hold its reading through a drop
#if defined(APPMESSAGE_HAS_PHONE)
    if (!dev_config_seed(DEV_STORE_PHONE))
    {
        phone_store_init((PhoneConfig){.live = false}, NULL);
    }
#endif
#if defined(APPMESSAGE_HAS_MUSIC)
    if (!dev_config_seed(DEV_STORE_MUSIC))
    {
        music_store_init((MusicConfig){.live = false}, NULL);
    }
#endif
}

void dev_walk_init(DevWalkMode mode, void (*apply_theme)(void))
{
    s_mode = mode;
    s_apply_theme = apply_theme;
    s_theme = 0;
    s_step = 0;

    if (mode == DEV_WALK_THEMES)
    {
        settings_set_u8(SETTING_THEME, 0);
        apply_shot(0);
    }
    else if (mode == DEV_WALK_CONFIG && dev_config_walk_show(0) && !dev_config_seed(DEV_STORE_WEATHER))
    {
        seed_shot_weather(&s_shots[0]);
    }

    // re-colour the zones and swap the frame for the current theme, then repaint everything
    if (apply_theme) apply_theme();
    engine_rebuild();

    if (mode != DEV_WALK_NONE)
    {
        accel_tap_service_subscribe(tap_handler);
    }
}

void dev_walk_deinit(void)
{
    if (s_mode != DEV_WALK_NONE)
    {
        accel_tap_service_unsubscribe();
    }
}
