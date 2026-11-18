/**
 * @file dev_config.h
 * @brief What a dev build takes from the unit's paf.dev.config.json beyond the walk: the clock and
 * date each screen pins, the settings it applies at launch, the readings it seeds in place of the
 * fixture, and the steps of a walk the file lays out as a list.
 *
 * paf build --dev writes the face's share of the file into a header the build puts beside the
 * settings page's, and dev_config.c is the only file that includes it. The harness in dev_walk.c asks
 * here before it seeds each store, and runs a listed walk through here, so a face reaches all of it
 * through the hooks in dev_hooks.h. With dev mode off every call here is an empty inline, and
 * dev_config.c compiles to nothing.
 *
 * A face whose walk lists panels defines dev_show_panel, and one whose walk has a step with a layout
 * defines dev_show_layout. A dev build whose walk needs one the face lacks stops at the link, naming
 * it, and a walk that needs neither links without them.
 *
 * @ingroup lib_dev
 */
#pragma once
#include <pebble.h>
#include "health/hrv_log.h"
#include "io/stores/health_store.h"
#include "io/stores/system_store.h"

/**
 * @addtogroup lib_dev
 * @{
 */

/** @brief How a setting's value travels, the way the settings page sends it. */
typedef enum
{
    DEV_VALUE_NUMBER, ///< A whole number, a toggle as 0 or 1, or a colour as 0xRRGGBB
    DEV_VALUE_TEXT    ///< Text
} DevValueType;

/** @brief One setting the config applies, by its message key. */
typedef struct
{
    const uint32_t *key; ///< The MESSAGE_KEY_ it goes on, which the SDK fills in at launch
    DevValueType type;   ///< How the value travels
    int32_t number;      ///< The value, for a number
    const char *text;    ///< The value, for text
} DevSetting;

/** @brief The stores a dev build seeds, for asking whether the config seeds one. */
typedef enum
{
    DEV_STORE_WEATHER,
    DEV_STORE_HEALTH,
    DEV_STORE_SYSTEM,
    DEV_STORE_PHONE,
    DEV_STORE_MUSIC,
    DEV_STORE_STOCKS,
    DEV_STORE_CALENDAR,
    DEV_STORE_LOCATION,
    DEV_STORE_COUNT ///< How many stores there are, not a store of its own
} DevStore;

/// The mark for no pick in a set of readings: a store left to the fixture, or a date left to the watch
#define DEV_NONE 0xFF

/** @brief One screen of a walk the config lays out as steps. */
typedef struct
{
    uint16_t first;     ///< Where its settings start in the walk's settings table
    uint16_t count;     ///< How many settings it applies
    const char *layout; ///< What it hands dev_show_layout, or NULL to leave the layout alone
    uint8_t readings;   ///< Which set of readings it shows, by its place in the table of sets
} DevStep;

/** @brief The clock, date, and seeds one screen shows. The launch's comes first in the table. */
typedef struct
{
    uint16_t minute;                ///< The pinned clock, as minutes past midnight
    uint8_t date;                   ///< Which pinned date, or DEV_NONE for the watch's own
    uint8_t store[DEV_STORE_COUNT]; ///< Which seed each store takes, by DevStore, or DEV_NONE for the fixture
} DevReadings;

/** @brief A pinned date, counted the way a struct tm counts it. */
typedef struct
{
    int16_t year;      ///< Years since 1900
    uint8_t month;     ///< 0 for January
    uint8_t day;       ///< The day of the month
    uint8_t weekday;   ///< 0 for Sunday
    uint16_t year_day; ///< 0 for the first of January
} DevDate;

/** @brief A run of rows in a table, such as one agenda's events. */
typedef struct
{
    uint16_t first; ///< Where the run starts
    uint16_t count; ///< How many rows it holds
} DevRun;

/** @brief One screen of a panel walk. */
typedef struct
{
    int panel; ///< The panel, as the face's C knows it
    int size;  ///< Its size, as the face's C knows it
} DevPanel;

/** @brief One heart rate reading for the day's chart. */
typedef struct
{
    uint8_t hour; ///< The hour it lands in, 0 for midnight
    uint8_t bpm;  ///< The reading
} DevHourReading;

/** @brief One HRV reading for the log, placed by its minute of the day. */
typedef struct
{
    uint16_t minute; ///< Its minute of the day, which is never after the pinned clock
    uint8_t ms;      ///< The reading
    HrvState state;  ///< What the wearer was doing
    bool asleep;     ///< Whether Pebble said the wearer was asleep
} DevHrvReading;

/** @brief One agenda event, placed against the watch's clock when the stores are seeded. */
typedef struct
{
    const char *title;    ///< The title
    const char *location; ///< The place, or empty
    bool all_day;         ///< True for an all-day event
    int32_t in_minutes;   ///< For a timed event, how many minutes from now it starts
    int32_t minutes;      ///< For a timed event, how long it runs
    int32_t in_days;      ///< For an all-day event, how many days after today it falls
} DevEvent;

/** @brief One health seed, with the day's heart rate and the HRV log the store builds from it. */
typedef struct
{
    HealthSeed seed;              ///< The readings and curves the seed takes as they are
    const DevHourReading *hr_day; ///< The day's heart rate, or NULL to leave that part out
    uint16_t hr_day_count;        ///< How many readings hr_day holds
    const DevHrvReading *hrv_log; ///< The HRV log, or NULL to leave it out
    uint16_t hrv_count;           ///< How many readings hrv_log holds
} DevHealth;

/** @brief One system seed, with its next alarm counted from when the stores are seeded. */
typedef struct
{
    SystemSeed seed;      ///< The battery and the link
    int32_t alarm_in_min; ///< Minutes until the next alarm, or 0 for none
} DevSystem;

/**
 * @brief Shows one panel on its own at one size, for a walk that lists panels. The face defines it,
 * and the dev plugin calls it on each step of the walk, then runs the face's theme hook and rebuilds.
 *
 * @param panel The panel, as the config's panels block names it to the C.
 * @param size Its size, the same way.
 */
void dev_show_panel(int panel, int size);

/**
 * @brief Shows one whole layout, for a walk with a step that has one. The face defines it, and the dev
 * plugin calls it on each step that has a layout, after the step's settings, then seeds the stores,
 * runs the face's theme hook, and rebuilds. A face whose walks have no layouts leaves it out.
 *
 * @param layout The step's layout, as the config writes it. Its shape is the face's own.
 */
void dev_show_layout(const char *layout);

#if DEV_MODE

/**
 * @brief Applies the config's settings through the settings catalogue, the way a save from the phone
 * lands, in memory only. Call it after settings_init and before the stores and the engine start. The
 * temperature unit the settings hold once it has run is the one the config's temperatures are
 * written in.
 */
void dev_config_apply_settings(void);

/**
 * @brief Says whether the config names a setting anywhere, at launch, in a step, or in a walk's each.
 * The AppMessage layer leaves such a key alone when the phone sends settings, so the phone's saved
 * value never lands over the config's.
 *
 * @param key The setting's message key, by its MESSAGE_KEY_ value.
 * @return True when the config names it.
 */
bool dev_config_holds(uint32_t key);

/**
 * @brief Which of the config's seeds a store takes on the screen on show.
 *
 * @param store The store.
 * @return The seed's place among the store's seeds, or DEV_NONE when the store takes the fixture.
 */
uint8_t dev_config_pick(DevStore store);

/**
 * @brief Sets a time to the clock the screen on show pins, and to its date when it pins one. That is
 * the launch's clock until a walk the config lays out moves onto a step with a clock of its own.
 *
 * @param when The time to set, changed in place.
 */
void dev_config_pin(struct tm *when);

/**
 * @brief Seeds a store from the readings the screen on show takes, when the config gives it any.
 *
 * @param store The store.
 * @return True when it seeded the store, false to leave the store to the fixture.
 */
bool dev_config_seed(DevStore store);

/**
 * @brief How many screens the walk the config lays out steps through, counting a step once for each
 * value of its each.
 *
 * @return The screens, or 0 when the build's walk is not one the config lays out.
 */
uint16_t dev_config_walk_count(void);

/**
 * @brief Moves the walk the config lays out onto one screen. A panel walk shows the screen's panel. A
 * step walk applies the step's settings with the value its each is on, picks the step's clock, date,
 * and readings for the stores to take, and shows its layout. The caller then seeds the stores, runs
 * the face's hook, and repaints.
 *
 * @param step Which screen, from 0.
 */
void dev_config_walk_show(uint16_t step);

#else

/** @brief Does nothing with dev mode off. */
static inline void dev_config_apply_settings(void) {}

/** @brief Has no seeds with dev mode off. @param store Unused. @return DEV_NONE. */
static inline uint8_t dev_config_pick(DevStore store) { (void)store; return DEV_NONE; }

/** @brief Leaves the time alone with dev mode off. @param when Unused. */
static inline void dev_config_pin(struct tm *when) { (void)when; }

/** @brief Seeds nothing with dev mode off. @param store Unused. @return False. */
static inline bool dev_config_seed(DevStore store) { (void)store; return false; }

/** @brief Has no walk with dev mode off. @return 0. */
static inline uint16_t dev_config_walk_count(void) { return 0; }

/** @brief Does nothing with dev mode off. @param step Unused. */
static inline void dev_config_walk_show(uint16_t step) { (void)step; }

#endif

/** @} */
