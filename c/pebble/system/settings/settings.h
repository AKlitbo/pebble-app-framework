/**
 * @file settings.h
 * @brief The persist API. A per-face `SettingField` table drives versioned load and save,
 * sanitizing, the typed reads, and the AppMessage round trip, so the shared code never
 * names or hardcodes a single field.
 *
 * @ingroup lib_settings
 */
#pragma once
#include <pebble.h>

/**
 * @addtogroup lib_settings
 * @{
 */

/**
 * @brief Identity of a known (shared) setting, used for typed reads and indexing.
 *
 * Face-only settings sit in the same field table but carry an id of SETTING_COUNT
 * or greater, so they are serialised yet never indexed for a shared read.
 */
typedef enum
{
    SETTING_TEMPERATURE_UNIT,          ///< Celsius or Fahrenheit
    SETTING_DATE_FORMAT,               ///< The date line's format string
    SETTING_THEME,                     ///< Which theme is active
    SETTING_STEPS_MODE,                ///< Steps, miles, or km on the steps readout
    SETTING_DISTANCE_UNIT,             ///< Km or miles on the standalone Distance panel
    SETTING_TIME_FORMAT,               ///< Which TimeFormat the clock uses
    SETTING_BLUETOOTH_ICON,            ///< Whether the bluetooth icon shows
    SETTING_QUIET_TIME_ICON,           ///< Whether the Quiet Time mark shows
    SETTING_BLUETOOTH_VIBE_CONNECT,    ///< Vibe pattern to fire when the phone connects
    SETTING_BLUETOOTH_VIBE_DISCONNECT, ///< Vibe pattern to fire when the phone drops
    SETTING_HOURLY_VIBE,               ///< Vibe pattern to fire on the hour
    SETTING_BATTERY_DISPLAY,           ///< What the battery readout shows
    SETTING_HEADER_FONT,               ///< Which font the panel header labels use, as an index into the face's header font table
    SETTING_COUNT                      ///< How many known settings there are
} SettingId;

/**
 * @brief How a setting encodes on the wire and how the sanitize pass clamps it.
 */
typedef enum
{
    SETTING_BOOL,     ///< Sent as a byte, 0 or 1. `default_num` holds the default
    SETTING_ENUM_U8,  ///< Sent as text holding the number, since Clay sends selects as strings
    SETTING_CSTRING,  ///< Sent as text, copied into a fixed buffer
    SETTING_COLOR     ///< Sent as a 0xRRGGBB number, stored as one opaque GColor byte
} SettingType;

/**
 * @brief Blueprint for a single setting.
 */
typedef struct
{
    SettingId   id;               ///< Known id for typed reads. SETTING_COUNT or higher means face-only
    const uint32_t *message_key;  ///< The `MESSAGE_KEY_*` this field rides on, filled in by the SDK at runtime
    SettingType type;             ///< Drives both the wire encoding and the cleanup pass
    uint16_t    offset;           ///< Where this field sits in the owning face's struct
    uint16_t    size;             ///< Buffer size, for SETTING_CSTRING only
    uint8_t     enum_count;       ///< How many values are allowed, so the highest is one less, for SETTING_ENUM_U8 only
    uint32_t    default_num;      ///< Default on a fresh install for BOOL and ENUM_U8, and the 0xRRGGBB colour for COLOR
    const char *default_str;      ///< Default on a fresh install for CSTRING
    bool        affects_layout;   ///< A change re-renders the clock, for the date and time formats
    bool        affects_weather;  ///< A change asks for fresh weather, for the temperature unit
} SettingField;

/**
 * @brief A face's persistence identity.
 *
 * Its storage key, current schema version, frozen v1 blob size, the face struct to
 * load into (its first byte must be the uint8_t version), that struct's size, the
 * field table that drives defaults/sanitize/serialisation, and an optional migration
 * hook to rescue pre-versioned data.
 *
 * A face can persist more than one struct by chaining schemas through companion: each
 * schema points to the next and the last one is NULL. settings_init walks the chain so
 * load, save, serialise, and inbox decode all cover every schema. Each link owns its own
 * key, version, and blob, so a domain (e.g. weather or a colour table) can sit in its own
 * key instead of bloating the main one. The typed reads (settings_u8/str) index the whole
 * chain and remember each field's owning schema, so a shared field (id < SETTING_COUNT)
 * can live in any link.
 */
typedef struct SettingsSchema
{
    uint32_t key;                     ///< Storage key for this face's blob
    uint8_t version;                  ///< This face's current schema version
    uint16_t min_versioned_size;      ///< Smallest versioned blob accepted, the frozen v1 size
    void *blob;                       ///< The face's settings struct, version byte first
    uint16_t blob_size;               ///< Size of that struct
    const SettingField *fields;       ///< The face's field table
    uint8_t field_count;              ///< How many entries are in `fields`
    bool (*migrate)(int stored_size); ///< Lifts an old blob from before versioning, true if handled. NULL when none
    const struct SettingsSchema *companion; ///< Next schema in the chain, or NULL
} SettingsSchema;

/**
 * @brief Carries what an inbound settings message changed, so the caller can react.
 */
typedef struct
{
    bool changed;         ///< Any field was updated, so save and repaint
    bool layout_changed;  ///< A date or time format changed, so re-render the clock
    bool weather_changed; ///< The temperature unit changed, so ask for fresh weather
} SettingsInbound;

/**
 * @brief Load a face's settings from a trusted blob, applying defaults first.
 *
 * Walks the companion chain so every schema in it is loaded.
 *
 * @param schema The head schema defining the face's settings.
 */
void settings_init(const SettingsSchema *schema);

/**
 * @brief Whether the watch booted with no saved settings, because storage was wiped by a fresh
 * install or an update. Lets the phone know it should push its own config back rather than
 * trust the watch's defaults.
 *
 * @return true when any schema in the chain had no blob at `settings_init`, or one was reset for a
 * blob it could not read, and no settings page message has landed since.
 */
bool settings_was_fresh(void);

/**
 * @brief Persist the active face's structs under their keys (the whole chain).
 */
void settings_save(void);

/**
 * @brief Clears settings_was_fresh once a save or restore from the settings page has been saved.
 *
 * Only that message counts. Anything else the phone sends while the watch is fresh stays in
 * memory, so the phone still sees a fresh watch and pushes its whole config back.
 */
void settings_mark_restored(void);

/**
 * @brief Read a known uint8/bool setting by id.
 *
 * @param id The known setting to read.
 * @return The stored value, or 0 if the active face did not subscribe to it.
 */
uint8_t settings_u8(SettingId id);

/**
 * @brief Read a known string setting by id.
 *
 * @param id The known setting to read.
 * @return The stored string, or "" if the active face did not subscribe to it.
 */
const char *settings_str(SettingId id);

/**
 * @brief Write a known uint8 or enum setting by id. In memory only, does not persist.
 *
 * The write-side mirror of `settings_u8`. Does nothing if the active face isn't subscribed to
 * the id. Used by the dev theme walk to force a theme without touching persistence.
 *
 * @param id The known setting to write.
 * @param value The value to store.
 */
void settings_set_u8(SettingId id, uint8_t value);

/**
 * @brief How many values an enum setting allows (its sanitize ceiling).
 *
 * Lets a walk step through every option of an enum (e.g. every theme) without hand-counting.
 *
 * @param id The known enum setting.
 * @return The value count, or 0 if the active face didn't subscribe to it.
 */
uint8_t settings_enum_count(SettingId id);

/**
 * @brief The most outbox bytes every field of the active face could ever take once written.
 *
 * Counts each string as filling its whole buffer, so no later settings change can outgrow it. The
 * transport sizes its outbox from this when it opens.
 *
 * @return The bytes the fields could need, not counting the dictionary's own one byte header.
 */
uint32_t settings_serialized_size_max(void);

/**
 * @brief Write every field of the active face into an outbox iterator.
 *
 * Stops at the first field that does not fit. The transport opens its outbox at
 * settings_serialized_size_max, so the whole snapshot fits.
 *
 * @param iter The dictionary iterator to encode into.
 * @return True when every field was written, false when the outbox ran out of room partway.
 */
bool settings_serialize(DictionaryIterator *iter);

/**
 * @brief Apply any settings present in an inbox message to the active face.
 *
 * Decodes only. The caller persists and reacts based on the returned flags.
 *
 * A field already holding what the message carries is left alone and flags nothing. The config
 * page sends the whole page on every save, so the flags say what moved rather than what turned up.
 *
 * @param iter The dictionary iterator to decode from.
 * @return Which categories of setting changed.
 */
SettingsInbound settings_apply_inbox(DictionaryIterator *iter);

/** @} */
