/**
 * @file link_change.spec.c
 * @brief Host tests for telling a real change of the phone link from a reading that changes nothing.
 *
 * The system store buzzes, runs the face's reconnect catch-up, and wakes the stores listening for
 * the link only on what this calls a change. Calling a repeat a change buzzes the wearer for nothing
 * and spends a refetch on every flap, and calling the launch reading one buzzes at every start. A
 * real drop or return missed leaves the face silent and its phone readings stale. A face that adds
 * no link listener gets exactly these decisions, and nothing more.
 */
#include "unity.h"

#include "io/link_change.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief A face that launches with the phone there never runs its reconnect work at launch. */
void test_the_first_reading_up_only_seeds(void)
{
    LinkState state = {0};

    LinkChange result = link_change_read(&state, true);

    TEST_ASSERT_EQUAL_INT(LINK_SAME, result);
}

/**
 * @brief A seed that said connected and a launch with the phone away is still no change.
 *
 * A screenshot seed or a stale state can say connected, and a face launched with the phone away
 * must not buzz the wearer at start.
 */
void test_the_first_reading_down_after_a_connected_seed_only_seeds(void)
{
    LinkState state = {.connected = true};

    LinkChange result = link_change_read(&state, false);

    TEST_ASSERT_EQUAL_INT(LINK_SAME, result);
}

/** @brief The first reading is kept, so the face reads the link as it really is from launch. */
void test_the_first_reading_is_kept(void)
{
    LinkState state = {.connected = true};

    link_change_read(&state, false);

    TEST_ASSERT_FALSE(state.connected);
}

/** @brief A report that repeats the link as it was is no change, so a chatty service never buzzes twice. */
void test_a_repeat_is_no_change(void)
{
    LinkState state = {0};
    link_change_read(&state, true);

    LinkChange result = link_change_read(&state, true);

    TEST_ASSERT_EQUAL_INT(LINK_SAME, result);
}

/** @brief The phone going away is a drop, which buzzes and clears the readings only the phone can give. */
void test_the_link_going_down_is_a_drop(void)
{
    LinkState state = {0};
    link_change_read(&state, true);

    LinkChange result = link_change_read(&state, false);

    TEST_ASSERT_EQUAL_INT(LINK_DROPPED, result);
}

/** @brief The phone coming back is a reconnect, the one change the stale readings catch up on. */
void test_the_link_coming_back_is_a_reconnect(void)
{
    LinkState state = {0};
    link_change_read(&state, false);

    LinkChange result = link_change_read(&state, true);

    TEST_ASSERT_EQUAL_INT(LINK_RECONNECTED, result);
}

/** @brief A drop then a return reads as each in turn, so a flap is two changes and never more. */
void test_a_flap_is_a_drop_then_a_reconnect(void)
{
    LinkState state = {0};
    link_change_read(&state, true);

    LinkChange dropped = link_change_read(&state, false);
    LinkChange repeated = link_change_read(&state, false);
    LinkChange back = link_change_read(&state, true);

    TEST_ASSERT_EQUAL_INT(LINK_DROPPED, dropped);
    TEST_ASSERT_EQUAL_INT(LINK_SAME, repeated);
    TEST_ASSERT_EQUAL_INT(LINK_RECONNECTED, back);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_the_first_reading_up_only_seeds);
    RUN_TEST(test_the_first_reading_down_after_a_connected_seed_only_seeds);
    RUN_TEST(test_the_first_reading_is_kept);
    RUN_TEST(test_a_repeat_is_no_change);
    RUN_TEST(test_the_link_going_down_is_a_drop);
    RUN_TEST(test_the_link_coming_back_is_a_reconnect);
    RUN_TEST(test_a_flap_is_a_drop_then_a_reconnect);
    return UNITY_END();
}
