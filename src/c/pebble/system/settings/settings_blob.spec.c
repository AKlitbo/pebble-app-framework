/**
 * @file settings_blob.spec.c
 * @brief Host tests for SETTINGS_BLOB, the macro that sets a schema's struct and both its sizes.
 *
 * The loader takes a saved blob from the first size up to the struct's size. So what is worth
 * pinning is that the first size comes out as the number written, even once the struct has grown
 * past it, or an append turns away every older save. The spellings that have to stop the build sit
 * in tests/c/spec/stops/, and these are the ones that have to keep building.
 */
#include "unity.h"

#include "system/settings/settings.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A first size held in a macro, the way a face names one. */
#define FACE_SETTINGS_V1_SIZE 25

/** @brief A face's struct after one append, 25 bytes when it first shipped and 26 now. */
typedef struct
{
    uint8_t version;
    uint8_t theme;
    char    date_format[23];
    uint8_t hourly_vibe;  ///< appended in a later release
} FaceSettings;

static FaceSettings s_settings;

/**
 * @brief The first size stays at the number written while the struct has grown past it.
 *
 * Taking the struct's size here would raise the first size with the append, and every save from
 * before it would be dropped on the first launch after the update.
 */
void test_first_size_stays_as_written_after_an_append(void)
{
    const SettingsSchema schema = { SETTINGS_BLOB(s_settings, 25) };

    uint16_t result = schema.first_size;

    TEST_ASSERT_EQUAL_UINT16(25, result);
}

/** @brief The blob is the struct and its size is the whole struct, so a save writes every field. */
void test_blob_size_is_the_whole_struct(void)
{
    const SettingsSchema schema = { SETTINGS_BLOB(s_settings, 25) };

    uint16_t result = schema.blob_size;

    TEST_ASSERT_EQUAL_PTR(&s_settings, schema.blob);
    TEST_ASSERT_EQUAL_UINT16(26, result);
}

/** @brief A macro holding the number builds and gives that number, which is how a face names one. */
void test_a_macro_holding_the_number_gives_that_number(void)
{
    const SettingsSchema schema = { SETTINGS_BLOB(s_settings, FACE_SETTINGS_V1_SIZE) };

    uint16_t result = schema.first_size;

    TEST_ASSERT_EQUAL_UINT16(25, result);
}

/**
 * @brief A first size equal to the struct builds, since a blob nothing was ever appended to has
 * the same size as when it first shipped.
 */
void test_a_first_size_equal_to_the_struct_builds(void)
{
    const SettingsSchema schema = { SETTINGS_BLOB(s_settings, 0x1a) };

    uint16_t result = schema.first_size;

    TEST_ASSERT_EQUAL_UINT16(26, result);
}

/** @brief A number written with a u on its end builds and gives that number. */
void test_an_unsigned_number_builds(void)
{
    const SettingsSchema schema = { SETTINGS_BLOB(s_settings, 25u) };

    uint16_t result = schema.first_size;

    TEST_ASSERT_EQUAL_UINT16(25, result);
}

/** @brief A companion blob, shaped like a face's weather settings, 3 bytes when it first shipped and 4 now. */
typedef struct
{
    uint8_t version;
    uint8_t temperature_unit;
    uint8_t wind_unit;
    uint8_t pressure_unit;  ///< appended in a later release
} WeatherSettings;

static WeatherSettings s_weather;

static const SettingsSchema s_weather_schema = { SETTINGS_BLOB(s_weather, 3) };
static const SettingsSchema s_face_schema = { SETTINGS_BLOB(s_settings, 25), .companion = &s_weather_schema };

/**
 * @brief Two schemas in one file, chained through companion, each keep their own first size.
 *
 * Every face with a companion writes the macro twice in one file. A mix-up between the two would
 * hold one blob to the other's first size and drop its older saves.
 */
void test_chained_schemas_keep_their_own_first_sizes(void)
{
    const SettingsSchema *companion = s_face_schema.companion;

    uint16_t result = companion->first_size;

    TEST_ASSERT_EQUAL_UINT16(3, result);
    TEST_ASSERT_EQUAL_UINT16(25, s_face_schema.first_size);
    TEST_ASSERT_EQUAL_UINT16(4, companion->blob_size);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_first_size_stays_as_written_after_an_append);
    RUN_TEST(test_blob_size_is_the_whole_struct);
    RUN_TEST(test_a_macro_holding_the_number_gives_that_number);
    RUN_TEST(test_a_first_size_equal_to_the_struct_builds);
    RUN_TEST(test_an_unsigned_number_builds);
    RUN_TEST(test_chained_schemas_keep_their_own_first_sizes);
    return UNITY_END();
}
