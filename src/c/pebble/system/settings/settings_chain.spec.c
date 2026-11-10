/**
 * @file settings_chain.spec.c
 * @brief Host tests for the walk over a face's settings schemas and the launch checks over them.
 *
 * Every load, save, reply, and apply walks through this one helper, so what is worth pinning is the
 * order it gives and where it stops. A walk that missed the framework's schema would drop the
 * plugin source choice from the reply, and one that went round it twice would send it twice. The
 * checks only look at the face's own chain, or they would find the framework's own field and key.
 */
#include "unity.h"

#include "system/settings/settings_chain.h"

void setUp(void) {}
void tearDown(void) {}

/// stand-ins for the SDK's message keys, only ever used by address
static uint32_t s_key_theme = 1;
static uint32_t s_key_weather_provider = 2;

static uint8_t s_blob[4];

static const SettingField s_face_fields[] = {
    { .id = SETTING_THEME, .message_key = &s_key_theme, .type = SETTING_ENUM_U8, .offset = 1, .enum_count = 4 },
};

static const SettingField s_doubled_fields[] = {
    { .id = SETTING_COUNT, .message_key = &s_key_weather_provider, .type = SETTING_CSTRING, .offset = 1, .size = 3 },
};

static const SettingField s_tail_fields[] = {
    { .id = SETTING_COUNT, .message_key = &s_key_weather_provider, .type = SETTING_CSTRING, .offset = 1, .size = 3 },
};

static const SettingsSchema s_companion = { .key = 2, .blob = s_blob, .fields = s_face_fields, .field_count = 1 };
static const SettingsSchema s_head = { .key = 1, .blob = s_blob, .fields = s_face_fields, .field_count = 1, .companion = &s_companion };
static const SettingsSchema s_tail = { .key = SETTINGS_PLUGIN_SOURCE_KEY, .blob = s_blob, .fields = s_tail_fields, .field_count = 1 };

/** The schemas a walk visits, in order, up to eight. */
static int walk(const SettingsSchema *head, const SettingsSchema *tail, const SettingsSchema **seen)
{
    int count = 0;

    SETTINGS_CHAIN_EACH(schema, head, tail)
    {
        if (count == 8)
        {
            break;
        }

        seen[count++] = schema;
    }

    return count;
}

/** @brief The framework's schema comes after the face's last companion, so it is loaded, saved, and sent with the rest. */
void test_walk_puts_the_framework_schema_after_the_face_chain(void)
{
    const SettingsSchema *seen[8];

    int result = walk(&s_head, &s_tail, seen);

    TEST_ASSERT_EQUAL_INT(3, result);
    TEST_ASSERT_EQUAL_PTR(&s_head, seen[0]);
    TEST_ASSERT_EQUAL_PTR(&s_companion, seen[1]);
    TEST_ASSERT_EQUAL_PTR(&s_tail, seen[2]);
}

/** @brief A face with no settings of its own passes NULL, and still keeps the choice. */
void test_walk_with_no_face_schema_visits_the_framework_schema_alone(void)
{
    const SettingsSchema *seen[8];

    int result = walk(NULL, &s_tail, seen);

    TEST_ASSERT_EQUAL_INT(1, result);
    TEST_ASSERT_EQUAL_PTR(&s_tail, seen[0]);
}

/** @brief A face without a plugin define walks exactly its own chain, with nothing after its last schema. */
void test_walk_with_no_framework_schema_is_the_face_chain(void)
{
    const SettingsSchema *seen[8];

    int result = walk(&s_head, NULL, seen);

    TEST_ASSERT_EQUAL_INT(2, result);
    TEST_ASSERT_EQUAL_PTR(&s_companion, seen[1]);
}

/**
 * @brief A second walk, as a second settings_init or the next save makes, gives the same schemas.
 *
 * The framework's schema is never linked onto the face's chain, so walking again cannot add it twice
 * and send the choice twice.
 */
void test_walk_again_visits_the_framework_schema_once(void)
{
    const SettingsSchema *seen[8];
    walk(&s_head, &s_tail, seen);

    int result = walk(&s_head, &s_tail, seen);

    TEST_ASSERT_EQUAL_INT(3, result);
}

/** @brief Serialize and apply walk every field, so each plugin key has to come up exactly once or the reply carries it twice. */
void test_walk_reaches_the_plugin_key_once(void)
{
    int result = 0;

    SETTINGS_CHAIN_EACH(schema, &s_head, &s_tail)
    {
        for (uint8_t i = 0; i < schema->field_count; i++)
        {
            result += schema->fields[i].message_key == &s_key_weather_provider;
        }
    }

    TEST_ASSERT_EQUAL_INT(1, result);
}

/** @brief A face that still keeps its own field on a key the framework keeps is found, so the launch can log it. */
void test_has_field_finds_a_face_field_doubling_the_framework_one(void)
{
    const SettingsSchema doubled = { .key = 3, .blob = s_blob, .fields = s_doubled_fields, .field_count = 1 };
    const SettingsSchema head = { .key = 1, .blob = s_blob, .fields = s_face_fields, .field_count = 1, .companion = &doubled };

    bool result = settings_chain_has_field(&head, &s_key_weather_provider);

    TEST_ASSERT_TRUE(result);
}

/** @brief The framework's own field is not the face's, or every face keeping the choice would log a doubled field. */
void test_has_field_leaves_the_framework_schema_out(void)
{
    bool result = settings_chain_has_field(&s_head, &s_key_weather_provider);

    TEST_ASSERT_FALSE(result);
}

/** @brief A face schema on the framework's key is found, since the two would overwrite each other on every save. */
void test_has_key_finds_a_face_schema_on_the_framework_key(void)
{
    const SettingsSchema clash = { .key = SETTINGS_PLUGIN_SOURCE_KEY, .blob = s_blob, .fields = s_face_fields, .field_count = 1 };
    const SettingsSchema head = { .key = 1, .blob = s_blob, .fields = s_face_fields, .field_count = 1, .companion = &clash };

    bool result = settings_chain_has_key(&head, SETTINGS_PLUGIN_SOURCE_KEY);

    TEST_ASSERT_TRUE(result);
}

/** @brief A face with no settings of its own has no key to clash with. */
void test_has_key_finds_nothing_with_no_face_schema(void)
{
    bool result = settings_chain_has_key(NULL, SETTINGS_PLUGIN_SOURCE_KEY);

    TEST_ASSERT_FALSE(result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_walk_puts_the_framework_schema_after_the_face_chain);
    RUN_TEST(test_walk_with_no_face_schema_visits_the_framework_schema_alone);
    RUN_TEST(test_walk_with_no_framework_schema_is_the_face_chain);
    RUN_TEST(test_walk_again_visits_the_framework_schema_once);
    RUN_TEST(test_walk_reaches_the_plugin_key_once);
    RUN_TEST(test_has_field_finds_a_face_field_doubling_the_framework_one);
    RUN_TEST(test_has_field_leaves_the_framework_schema_out);
    RUN_TEST(test_has_key_finds_a_face_schema_on_the_framework_key);
    RUN_TEST(test_has_key_finds_nothing_with_no_face_schema);
    return UNITY_END();
}
