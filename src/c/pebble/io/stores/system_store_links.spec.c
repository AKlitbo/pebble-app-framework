/**
 * @file system_store_links.spec.c
 * @brief Host tests for the room on the system store's link listener list.
 *
 * The list is sized from the request keys a face declares, one slot for each framework store that
 * listens. A face can add a listener of its own too, and a list with no room for it drops it with
 * only a log line, so the face never hears the phone come back. This spec builds the list as a face
 * with only the weather store listening sees it, the tightest list there is.
 */
#define HAS_MESSAGE_KEY_WEATHER_REQUEST 1

#include "unity.h"

#include "io/callback_list.h"
#include "io/stores/system_store.h"

static CallbackListFn entries[SYSTEM_STORE_LINK_LISTENER_SLOTS];
static CallbackList listeners;

/** @brief Stands in for the weather store's own listener. */
static void weather_listener(void) {}

/** @brief Stands in for a listener of the face's own. */
static void face_listener(void) {}

void setUp(void)
{
    listeners = (CallbackList){entries, SYSTEM_STORE_LINK_LISTENER_SLOTS, 0};
}

void tearDown(void) {}

/**
 * @brief A face's own listener still fits beside the weather store's.
 *
 * A list with only the weather store's slot drops it as "link listener list full", and the face's
 * own work on a reconnect never runs.
 */
void test_takes_a_face_listener_beside_the_weather_store(void)
{
    callback_list_add(&listeners, weather_listener);

    bool result = callback_list_add(&listeners, face_listener);

    TEST_ASSERT_TRUE(result);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_takes_a_face_listener_beside_the_weather_store);
    return UNITY_END();
}
