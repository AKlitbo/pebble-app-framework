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
 * or greater, so they are serialized yet never indexed for a shared read.
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
    SETTING_WIND_UNIT,                 ///< Which WindUnit a wind speed reads out in
    SETTING_COUNT                      ///< How many known settings there are
} SettingId;

/**
 * @brief How a setting encodes on the wire and how the sanitize pass clamps it.
 */
typedef enum
{
    SETTING_BOOL,     ///< 0 or 1, taken as an int or as digits and sent back as a byte. `default_num` holds the default
    SETTING_ENUM_U8,  ///< A choice, taken as an int or as digits and sent back as text holding the number
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
 * Its storage key, current schema version, the face struct to load into (its first
 * byte must be the uint8_t version), that struct's size and the size it first shipped
 * at, the field table that drives defaults/sanitize/serialization, and an optional
 * migration hook to rescue pre-versioned data. SETTINGS_BLOB fills in the struct and
 * both sizes.
 *
 * A face can persist more than one struct by chaining schemas through companion: each
 * schema points to the next and the last one is NULL. settings_init walks the chain so
 * load, save, serialize, and inbox decode all cover every schema. Each link owns its own
 * key, version, and blob, so a domain (e.g. weather or a colour table) can sit in its own
 * key instead of bloating the main one. The typed reads (settings_u8/str) index the whole
 * chain and remember each field's owning schema, so a shared field (id < SETTING_COUNT)
 * can live in any link. A face built with a plugin define also gets the framework's own schema,
 * on SETTINGS_PLUGIN_SOURCE_KEY. It is never linked onto the face's chain. The walk in
 * settings_chain.h visits it after the face's last schema.
 */
typedef struct SettingsSchema
{
    uint32_t key;                     ///< Storage key for this face's blob
    uint8_t version;                  ///< This face's current schema version
    uint16_t first_size;              ///< The struct's size in its first release, the smallest blob accepted. Set with SETTINGS_BLOB
    void *blob;                       ///< The face's settings struct, version byte first. Set with SETTINGS_BLOB
    uint16_t blob_size;               ///< Size of that struct. Set with SETTINGS_BLOB
    const SettingField *fields;       ///< The face's field table
    uint8_t field_count;              ///< How many entries are in `fields`
    bool (*migrate)(int stored_size); ///< Lifts an old blob from before versioning, true if handled. NULL when none
    const struct SettingsSchema *companion; ///< Next schema in the chain, or NULL
} SettingsSchema;

/**
 * @brief The persist key the framework keeps the weather, calendar, and stock source choices on, so
 * a face leaves it free.
 *
 * Only a face built with `PLUGIN_WEATHER`, `PLUGIN_CALENDAR`, or `PLUGIN_STOCKS` that offers the
 * choice writes it. Every face leaves it free anyway, for its settings and its stores, since turning
 * a define on in a later release would otherwise land the choice on top of whatever the face kept
 * there. settings_init catches a settings schema on it but cannot see a store's key.
 */
#define SETTINGS_PLUGIN_SOURCE_KEY 249

/**
 * @brief The size of a settings struct, and a build that stops when the struct is too big to save.
 * SETTINGS_BLOB uses it for a schema's `blob_size`.
 *
 * One persist key holds at most 256 bytes, and the watch saves only the first 256 bytes of a longer
 * write. The fields past that would come back as their defaults on every launch. This stops the
 * build instead, so a face with more than 256 bytes of settings moves some into a companion schema.
 * settings_init logs an error at launch for a schema whose `blob_size` was filled in without it.
 *
 * @param blob The settings struct itself, not a pointer to it.
 * @return The struct's size in bytes.
 */
#define SETTINGS_BLOB_SIZE(blob) \
    (sizeof(blob) + 0 * sizeof(struct { \
        _Static_assert(sizeof(blob) <= PERSIST_DATA_MAX_LENGTH, \
                       "settings struct is over 256 bytes, so move some fields into a companion schema"); \
        char unused; \
    }))

/**
 * @brief Sets a schema's settings struct, its size, and the size it first shipped at, for a
 * schema's initializer.
 *
 * It fills in `.blob`, `.blob_size`, and `.first_size`. The first size is the struct's size in bytes
 * in the first release that saved it, and it never changes after that release. A saved blob smaller
 * than it cannot be this schema's. One from the first size up to today's size reads in, and every
 * field appended since keeps its default. The struct's sizeof rises with each appended field and
 * would turn away every older save, so the first size has to be written as the number itself, or a
 * macro that is one. The build stops on sizeof, SETTINGS_BLOB_SIZE, a sum, brackets, or a cast
 * written in place, and on a first size of 0 or one bigger than the struct. A constant worked out
 * from sizeof somewhere else, such as an enum, still gets through.
 *
 * @code
 * static const SettingsSchema s_schema = {
 *     .key = FACE_SETTINGS_KEY,
 *     .version = FACE_SETTINGS_VERSION,
 *     SETTINGS_BLOB(s_settings, 25),
 *     .fields = s_fields,
 *     .field_count = ARRAY_LENGTH(s_fields),
 * };
 * @endcode
 *
 * @param settings The settings struct itself, not a pointer to it or its type.
 * @param first The struct's size in bytes in its first release, such as 25.
 * @return The three designated initializers, for inside the schema's braces.
 */
#define SETTINGS_BLOB(settings, first) \
    .blob = &(settings), \
    .blob_size = SETTINGS_BLOB_SIZE(settings), \
    .first_size = SETTINGS_FIRST_SIZE_(first, settings)

/**
 * @brief The first size for SETTINGS_BLOB, and a build that stops when it is written as more than
 * one token, or is 0 or past the struct's size.
 *
 * SETTINGS_BLOB hands the first size on to this away from any `##`, so a macro holding a number has
 * become that number by the time it lands here.
 *
 * @param first The struct's size in bytes in its first release.
 * @param settings The settings struct itself.
 * @return The first size.
 */
// the first size is pasted into a field name, which only works for a single token
// sizeof(...), SETTINGS_BLOB_SIZE(...), a sum, brackets, or a cast stops the build on the char line
// below. an enum worked out from sizeof is one token too, so it gets through
// write the size the struct had in its first release, as a number such as 25
#define SETTINGS_FIRST_SIZE_(first, settings) \
    ((first) + 0 * sizeof(struct { \
        char settings_first_size_##first##_is_a_number; \
        _Static_assert((first) >= 1 && (first) <= sizeof(settings), \
                       "first size is 0 or bigger than the settings struct, so give the size the struct first shipped with"); \
    }))

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
 * @brief Load a face's settings from their saved blobs, applying defaults first.
 *
 * Walks the companion chain so every schema in it is loaded. A saved blob is read only when its
 * size and version fit the schema, or when the schema's migrate hook takes it, and every field read
 * back is cleaned. A blob that fits neither is dropped and the schema stays on its defaults. A
 * schema over the 256 bytes one persist key holds is logged as an error, since it can never be saved
 * whole. SETTINGS_BLOB stops the build for one, so the log catches a schema written without it.
 *
 * A face built with `PLUGIN_WEATHER`, `PLUGIN_CALENDAR`, or `PLUGIN_STOCKS` that declares the kind's
 * select key also gets the framework's schema for the source choice, walked after its own and saved under
 * SETTINGS_PLUGIN_SOURCE_KEY. The choice is only kept once this has run, so a face with no settings
 * of its own still has to call it, as settings_init(NULL), or a reset of the Pebble app drops the
 * wearer's pick. The pick only reaches the phone in the settings reply, so the build adds
 * SETTINGS_REQUEST and SETTINGS_FRESH to such a face's keys. Call it before appmessage_open, which
 * sizes the outbox from the settings reply. Called after, every settings reply goes out empty and a
 * reinstall restores nothing. A face schema on SETTINGS_PLUGIN_SOURCE_KEY is logged as an error and
 * the framework's schema is left out. A face field on a select key the framework keeps is logged too.
 *
 * @param schema The head schema defining the face's settings, or NULL for a face with none.
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
 *
 * A struct that does not reach flash whole is logged as an error and not tried again.
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
 * A toggle or a choice is taken whether it came as an int or as text holding only digits, through
 * tuple_number_or. A colour is taken as an int only, since colour text could be hex. Anything else
 * leaves the field as it was.
 *
 * @param iter The dictionary iterator to decode from.
 * @return Which categories of setting changed.
 */
SettingsInbound settings_apply_inbox(DictionaryIterator *iter);

/** @} */
