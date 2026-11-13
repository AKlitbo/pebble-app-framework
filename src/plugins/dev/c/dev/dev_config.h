/**
 * @file dev_config.h
 * @brief What a dev build takes from the unit's paf.dev.config.json beyond the walk and the clock: the
 * date, the settings it applies at launch, the readings it seeds in place of the fixture, and the steps
 * of a walk the file lays out as a list.
 *
 * paf build --dev writes the face's share of the file into a header the build puts beside the
 * settings page's, and dev_config.c is the only file that includes it. The theme walk in dev_walk.c
 * asks here before it seeds each store, and runs a listed walk through here, so a face reaches all of
 * it through the hooks in dev_hooks.h. With dev mode off every call here is an empty inline, and
 * dev_config.c compiles to nothing.
 *
 * A face whose walk lists panels defines dev_show_panel, and one whose walk lists layouts defines
 * dev_show_layout. A dev build whose walk needs one the face lacks stops at the link, naming it.
 *
 * @ingroup lib_dev
 */
#pragma once
#include <pebble.h>
#include "health/hrv_log.h"

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

/** @brief One screen of a walk the config lays out as steps. */
typedef struct
{
    uint16_t first;     ///< Where its settings start in the walk's settings table
    uint16_t count;     ///< How many settings it applies
    const char *layout; ///< What it hands dev_show_layout, or NULL to leave the layout alone
} DevStep;

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
    DEV_STORE_LOCATION
} DevStore;

/**
 * @brief Shows one panel on its own at one size, for a walk that lists panels. The face defines it,
 * and the dev plugin calls it on each step of the walk, then runs the face's theme hook and rebuilds.
 *
 * @param panel The panel, as the config's panels block names it to the C.
 * @param size Its size, the same way.
 */
void dev_show_panel(int panel, int size);

/**
 * @brief Shows one whole layout, for a walk that lists layouts. The face defines it, and the dev
 * plugin calls it on each step that has a layout, after the step's settings, then runs the face's
 * theme hook and rebuilds.
 *
 * @param layout The step's layout, as the config writes it. Its shape is the face's own.
 */
void dev_show_layout(const char *layout);

#if DEV_MODE

/**
 * @brief Applies the config's settings through the settings catalogue, the way a save from the phone
 * lands, in memory only. Call it after settings_init and before the stores and the engine start.
 */
void dev_config_apply_settings(void);

/**
 * @brief Sets a time to the pinned clock, and to the pinned date when the config has one.
 *
 * @param when The time to set, changed in place.
 */
void dev_config_pin(struct tm *when);

/**
 * @brief Seeds a store from the config's readings, when the config has any for it.
 *
 * @param store The store.
 * @return True when it seeded the store, false to leave the store to the fixture.
 */
bool dev_config_seed(DevStore store);

/**
 * @brief How many steps the walk the config lays out has.
 *
 * @return The steps, or 0 when the build's walk is not one the config lays out.
 */
uint16_t dev_config_walk_count(void);

/**
 * @brief Moves the walk the config lays out onto one step: a panel walk shows the step's panel, and a
 * step walk applies the step's settings and shows its layout. The caller repaints.
 *
 * @param step Which step, from 0.
 * @return True when the step switched the temperature unit, so the caller seeds the weather again.
 */
bool dev_config_walk_show(uint16_t step);

#else

/** @brief Does nothing with dev mode off. */
static inline void dev_config_apply_settings(void) {}

/** @brief Leaves the time alone with dev mode off. @param when Unused. */
static inline void dev_config_pin(struct tm *when) { (void)when; }

/** @brief Seeds nothing with dev mode off. @param store Unused. @return False. */
static inline bool dev_config_seed(DevStore store) { (void)store; return false; }

/** @brief Has no walk with dev mode off. @return 0. */
static inline uint16_t dev_config_walk_count(void) { return 0; }

/** @brief Does nothing with dev mode off. @param step Unused. @return False. */
static inline bool dev_config_walk_show(uint16_t step) { (void)step; return false; }

#endif

/** @} */
