/**
 * @file dev_walk.c
 * @brief The shared frame-face dev harness. It seeds the stores from a fixed fixture and
 * drives the theme walk. Always compiled, but the linker drops it from any face that never
 * calls it, which is every release build.
 *
 * @ingroup lib_dev
 */
#include "dev/dev_walk.h"

#include <time.h>

#include "io/stores/time_store.h"
#include "io/stores/weather_store.h"
#include "io/stores/health_store.h"
#include "io/stores/system_store.h"
#include "io/stores/location_store.h"
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
    const char *lat;  ///< Latitude, in the dash style the phone sends it in, such as "33-44"
    const char *lon;  ///< Longitude, in the same dash style
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
    int16_t     temp;       ///< Temperature reading
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
 * Spread on purpose rather than at random: a flat battery and a full one, a dropped phone, the
 * Quiet Time mark up and down, and a range of weather so the scene is not drawing the same sky
 * eight times.
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
static int s_hour;                  ///< The hour the face pinned the clock to
static int s_minute;                ///< The minute the face pinned the clock to

/**
 * @brief Seed the clock, weather, health, and system stores from one shot.
 *
 * The stores are only ever seeded here with live off, and neither takes a subscription on that
 * path, so seeding again on a tap re-seeds rather than stacking handlers.
 *
 * @param shot The shot to seed from.
 */
static void seed_shot(const DevShot *shot)
{
    // the pinned clock, never ticking
    time_t now = time(NULL);
    struct tm pinned = *localtime(&now);
    pinned.tm_hour = s_hour;
    pinned.tm_min = s_minute;
    pinned.tm_sec = 0;
    time_store_init((TimeConfig){.live = false, .minute_tick = false, .beats = false}, &pinned);

    // spread the empty seed so every reading the shot does not set (humidity, wind, uv, ...)
    // reads as "--" rather than a bogus 0
    WeatherSeed wx = WEATHER_SEED_EMPTY;
    wx.temp = shot->temp;
    wx.cond = shot->cond;
    weather_store_init((WeatherConfig){.live = false, .poll_min = 0}, &wx);

    HealthSeed health = {.hr = shot->hr, .steps = shot->steps, .calories = s_fixed.calories,
                         .sleep_min = s_fixed.sleep_min, .active_min = s_fixed.active_min,
                         .distance_m = s_fixed.distance_m};
    health_store_init((HealthConfig){.live = false}, &health);

    SystemSeed system = {.battery = shot->battery, .charging = false, .bluetooth = shot->bluetooth};
    system_store_init((SystemConfig){.live = false, .vibe = NULL}, &system);
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
    if (s_mode == DEV_WALK_THEMES)
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

    LocationSeed location = {.lat = s_fixed.lat, .lon = s_fixed.lon};
    location_store_init((LocationConfig){.live = false}, &location);
}

void dev_walk_init(DevWalkMode mode, void (*apply_theme)(void))
{
    s_mode = mode;
    s_apply_theme = apply_theme;
    s_theme = 0;

    if (mode == DEV_WALK_THEMES)
    {
        settings_set_u8(SETTING_THEME, 0);
        apply_shot(0);
    }

    // re-colour zones + swap the frame for the forced theme then repaint everything
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
