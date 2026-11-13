/**
 * @file dev_config.c
 * @brief The part of the dev harness the unit's paf.dev.config.json lays out: the settings applied at
 * launch, the readings seeded in place of the fixture, the pinned date, and the walks the config lists.
 * It reads them out of the header paf build --dev writes, so with dev mode off it compiles to nothing.
 *
 * @ingroup lib_dev
 */
#include "dev/dev_config.h"

#if DEV_MODE

#include <string.h>
#include <time.h>

#include "io/stores/weather_store.h"
#include "io/stores/health_store.h"
#include "io/stores/system_store.h"
#include "io/stores/location_store.h"
#include "io/stores/stock_store.h"
#include "io/stores/calendar_store.h"
#include "io/stores/phone_store.h"
#include "io/stores/music_store.h"
#include "io/appmessage/appmessage_features.h"
#include "health/hr_day.h"
#include "weather/weather_reading.h"
#include "system/settings/settings.h"

// the face's share of paf.dev.config.json, which paf build --dev writes beside settings_page.h
#include "dev_harness.h"

/**
 * @brief Applies settings through the settings catalogue, the way a save from the phone lands.
 *
 * The settings go into a dictionary and through settings_apply_inbox, which is what the phone's save
 * runs through, so a face's own field takes its value with no face code. A dev build never saves
 * settings, so the wearer's own settings on the emulator stay on flash as they were.
 *
 * @param settings The settings.
 * @param count How many.
 * @return What the settings changed, such as the temperature unit.
 */
static SettingsInbound apply_settings(const DevSetting *settings, uint16_t count)
{
    if (count == 0)
    {
        return (SettingsInbound){0};
    }

    // the build works the size out from the settings, so every write below fits
    static uint8_t s_buffer[DEV_CONFIG_DICT_SIZE];
    DictionaryIterator writer;
    dict_write_begin(&writer, s_buffer, sizeof(s_buffer));

    for (uint16_t index = 0; index < count; index++)
    {
        const DevSetting *setting = &settings[index];

        if (setting->type == DEV_VALUE_TEXT)
        {
            dict_write_cstring(&writer, *setting->key, setting->text);
        }
        else
        {
            dict_write_int32(&writer, *setting->key, setting->number);
        }
    }

    uint32_t size = dict_write_end(&writer);
    DictionaryIterator reader;
    dict_read_begin_from_buffer(&reader, s_buffer, (uint16_t)size);
    return settings_apply_inbox(&reader);
}

void dev_config_apply_settings(void)
{
    (void)apply_settings(s_dev_settings, DEV_CONFIG_SETTING_COUNT);
}

void dev_config_pin(struct tm *when)
{
    when->tm_hour = DEV_TIME_HOUR;
    when->tm_min = DEV_TIME_MIN;
    when->tm_sec = 0;

#if defined(DEV_CONFIG_HAS_DATE)
    // the build works the weekday and the day of the year out from the date, so a date panel reads
    // the same day on every run and no calendar maths runs on the watch
    when->tm_year = DEV_CONFIG_YEAR;
    when->tm_mon = DEV_CONFIG_MONTH;
    when->tm_mday = DEV_CONFIG_DAY;
    when->tm_wday = DEV_CONFIG_WEEKDAY;
    when->tm_yday = DEV_CONFIG_YEAR_DAY;
#endif
}

#if defined(DEV_CONFIG_SEEDS_WEATHER)
/**
 * @brief Seeds the weather store from the config's readings, in the unit the settings hold now.
 *
 * The config's temperatures are written in the unit the settings held when the stores were first
 * seeded, so a walk step that switches the unit converts them the way the store converts a reading in
 * hand when the wearer switches, rather than showing Celsius numbers beside an F.
 */
static void seed_weather(void)
{
    static bool s_written_known;      ///< Whether the unit the config's readings are written in is known yet
    static bool s_written_fahrenheit; ///< The unit the config's readings are written in
    static WeatherHourly s_hourly;    ///< The hourly strip, converted when the unit moved
    static WeatherDaily s_daily;      ///< The daily strip, converted when the unit moved

    // spread the empty seed so a reading the config leaves out reads as -- rather than 0, from a named
    // constant the linker drops with this function in a release build
    static const WeatherSeed s_empty = WEATHER_SEED_EMPTY;
    WeatherSeed seed = s_empty;
    dev_config_weather(&seed);

    bool fahrenheit = settings_u8(SETTING_TEMPERATURE_UNIT) != 0;

    if (!s_written_known)
    {
        s_written_known = true;
        s_written_fahrenheit = fahrenheit;
    }

    if (fahrenheit != s_written_fahrenheit)
    {
        seed.temp = (int16_t)weather_reading_convert_temp(seed.temp, fahrenheit);
        seed.temp_max = weather_reading_convert_temp(seed.temp_max, fahrenheit);
        seed.temp_min = weather_reading_convert_temp(seed.temp_min, fahrenheit);
        seed.feels_like = weather_reading_convert_temp(seed.feels_like, fahrenheit);
        seed.dew_point = weather_reading_convert_temp(seed.dew_point, fahrenheit);

        if (seed.forecast_hourly)
        {
            s_hourly = *seed.forecast_hourly;
            for (uint8_t index = 0; index < s_hourly.count && index < WEATHER_FORECAST_COLS; index++)
            {
                s_hourly.col[index].temp = (int16_t)weather_reading_convert_temp(s_hourly.col[index].temp, fahrenheit);
            }
            seed.forecast_hourly = &s_hourly;
        }

        if (seed.forecast_daily)
        {
            s_daily = *seed.forecast_daily;
            for (uint8_t index = 0; index < s_daily.count && index < WEATHER_FORECAST_COLS; index++)
            {
                s_daily.col[index].temp_max = (int16_t)weather_reading_convert_temp(s_daily.col[index].temp_max, fahrenheit);
                s_daily.col[index].temp_min = (int16_t)weather_reading_convert_temp(s_daily.col[index].temp_min, fahrenheit);
            }
            seed.forecast_daily = &s_daily;
        }
    }

    weather_store_init((WeatherConfig){.live = false, .poll_min = 0}, &seed);
}
#endif

#if defined(DEV_CONFIG_SEEDS_HEALTH)
#if defined(DEV_CONFIG_HR_DAY_COUNT)
static HrDay s_hr_day; ///< The day's heart rate, built from the config's readings
#endif
#if defined(DEV_CONFIG_HRV_COUNT)
static HrvLog s_hrv_log; ///< The HRV log, built from the config's readings
#endif

/**
 * @brief Seeds the health store, naming each part the config has readings for so the store takes them.
 *
 * The HRV readings are dated back from the watch's real clock by how far each sits before the pinned
 * clock, since the HRV panels work a reading's age out from the real clock. A shot taken in the minute
 * the face launched in shows the ages the config means.
 */
static void seed_health(void)
{
    HealthSeed seed = s_dev_health;

#if defined(DEV_CONFIG_HR_DAY_COUNT)
    hr_day_clear(&s_hr_day);
    for (uint16_t index = 0; index < DEV_CONFIG_HR_DAY_COUNT; index++)
    {
        hr_day_add(&s_hr_day, s_dev_hr_day[index].hour, s_dev_hr_day[index].bpm);
    }
    seed.hr_day = &s_hr_day;
#endif

#if defined(DEV_CONFIG_HRV_COUNT)
    uint32_t now_min = (uint32_t)(time(NULL) / 60);
    uint32_t clock_min = DEV_TIME_HOUR * 60 + DEV_TIME_MIN;

    hrv_log_reset(&s_hrv_log);
    for (uint16_t index = 0; index < DEV_CONFIG_HRV_COUNT; index++)
    {
        const DevHrvReading *reading = &s_dev_hrv_log[index];
        uint32_t at_min = now_min - (clock_min - reading->minute);
        hrv_log_add(&s_hrv_log, reading->ms, at_min, 1, reading->minute, reading->state, reading->asleep);
    }
    seed.hrv_log = &s_hrv_log;
#endif

    // a seeded store only takes a part's seed when the config names the part, so a part is named
    // exactly when the config has readings for it
    health_store_init((HealthConfig){
        .live = false,
        .hr_history = seed.hr_history ? HEALTH_HR_HISTORY : NULL,
        .step_history = seed.step_hourly ? HEALTH_STEP_HISTORY : NULL,
        .hr_day = seed.hr_day ? HEALTH_HR_DAY : NULL,
        .sleep = true, .active = true, .calories = true, .distance = true,
    }, &seed);
}
#endif

#if defined(DEV_CONFIG_SEEDS_CALENDAR)
/**
 * @brief Seeds the agenda, each event placed against the watch's real clock.
 *
 * The calendar panels count down against the real clock, so an event an hour out reads an hour out
 * whenever the shot is taken, though the start time it prints moves with it.
 */
static void seed_calendar(void)
{
    static CalendarStrip s_strip;
    time_t now = time(NULL);
    time_t today = time_start_of_today();

    memset(&s_strip, 0, sizeof(s_strip));
    s_strip.count = DEV_CONFIG_EVENT_COUNT;

    for (uint8_t index = 0; index < DEV_CONFIG_EVENT_COUNT; index++)
    {
        const DevEvent *event = &s_dev_events[index];
        CalendarEvent *slot = &s_strip.event[index];

        if (event->all_day)
        {
            slot->start = today + event->in_days * SECONDS_PER_DAY;
            slot->end = slot->start + SECONDS_PER_DAY;
            slot->all_day = true;
        }
        else
        {
            slot->start = now + event->in_minutes * SECONDS_PER_MINUTE;
            slot->end = slot->start + event->minutes * SECONDS_PER_MINUTE;
        }

        strncpy(slot->title, event->title, sizeof(slot->title) - 1);
        strncpy(slot->location, event->location, sizeof(slot->location) - 1);
    }

    calendar_store_init((CalendarConfig){.live = false, .poll_min = 0}, &(CalendarSeed){.strip = &s_strip});
}
#endif

bool dev_config_seed(DevStore store)
{
    switch (store)
    {
#if defined(DEV_CONFIG_SEEDS_WEATHER)
        case DEV_STORE_WEATHER:
            seed_weather();
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_HEALTH)
        case DEV_STORE_HEALTH:
            seed_health();
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_SYSTEM)
        case DEV_STORE_SYSTEM:
        {
            SystemSeed seed = s_dev_system;
            seed.next_alarm = DEV_CONFIG_ALARM_IN_MIN > 0 ? time(NULL) + DEV_CONFIG_ALARM_IN_MIN * SECONDS_PER_MINUTE : 0;
            system_store_init((SystemConfig){.live = false, .vibe = NULL}, &seed);
            return true;
        }
#endif
#if defined(DEV_CONFIG_SEEDS_PHONE)
        case DEV_STORE_PHONE:
            phone_store_init((PhoneConfig){.live = false}, &s_dev_phone);
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_MUSIC)
        case DEV_STORE_MUSIC:
            music_store_init((MusicConfig){.live = false}, &s_dev_music);
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_STOCKS)
        case DEV_STORE_STOCKS:
            stock_store_init((StockConfig){.live = false, .poll_min = 0}, &(StockSeed){.strip = &s_dev_stocks});
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_CALENDAR)
        case DEV_STORE_CALENDAR:
            seed_calendar();
            return true;
#endif
#if defined(DEV_CONFIG_SEEDS_LOCATION)
        case DEV_STORE_LOCATION:
            location_store_init((LocationConfig){.live = false}, &s_dev_location);
            return true;
#endif
        default:
            return false;
    }
}

uint16_t dev_config_walk_count(void)
{
#if defined(DEV_CONFIG_WALK_COUNT)
    return DEV_CONFIG_WALK_COUNT;
#else
    return 0;
#endif
}

bool dev_config_walk_show(uint16_t step)
{
#if defined(DEV_CONFIG_WALK_PANELS)
    const DevPanel *panel = &s_dev_panels[step % DEV_CONFIG_WALK_COUNT];
    dev_show_panel(panel->panel, panel->size);
    return false;
#elif defined(DEV_CONFIG_WALK_STEPS)
    // the build gives every step every setting the walk touches and a layout once any step has one,
    // so a step draws the same screen whichever step came before it and the walk comes back round
    const DevStep *shown = &s_dev_steps[step % DEV_CONFIG_WALK_COUNT];
    SettingsInbound changed = apply_settings(&s_dev_step_settings[shown->first], shown->count);

    if (shown->layout)
    {
        dev_show_layout(shown->layout);
    }

    return changed.weather_changed;
#else
    (void)step;
    return false;
#endif
}

#endif
