/**
 * @file callback_list.spec.c
 * @brief Host tests for the fixed callback list.
 *
 * The store cadence and the transport's end-of-message work both run through one of these. A fault
 * here is not one store misbehaving but every store behind the list quietly stopping, with the face
 * still drawing the last thing it had. Each test builds its own list, so none of them share state.
 */
#include "unity.h"

#include "io/callback_list.h"

static int s_first_calls;
static int s_second_calls;
static int s_order[3];
static int s_order_len;

void setUp(void)
{
    s_first_calls = 0;
    s_second_calls = 0;
    s_order_len = 0;
}

void tearDown(void) {}

// counts its own calls and notes its turn, for the order tests
static void first(void)
{
    s_first_calls++;
    if (s_order_len < 3)
    {
        s_order[s_order_len++] = 1;
    }
}

// a second callback, so there are two to order and to fill a list with
static void second(void)
{
    s_second_calls++;
    if (s_order_len < 3)
    {
        s_order[s_order_len++] = 2;
    }
}

/** @brief Callbacks run in the order they were added, so the one registered first gets its turn first. */
void test_fire_runs_in_the_order_added(void)
{
    CallbackListFn entries[2];
    CallbackList list = {entries, 2, 0};
    callback_list_add(&list, second);
    callback_list_add(&list, first);

    callback_list_fire(&list);

    TEST_ASSERT_EQUAL_INT(2, s_order_len);
    TEST_ASSERT_EQUAL_INT(2, s_order[0]);
    TEST_ASSERT_EQUAL_INT(1, s_order[1]);
}

/**
 * @brief Adding the same callback twice keeps one, so it runs once.
 *
 * A store's init can run again on a settings change. Doubling up there would save or repaint
 * twice on every message from then on.
 */
void test_adding_twice_keeps_one(void)
{
    CallbackListFn entries[2];
    CallbackList list = {entries, 2, 0};
    callback_list_add(&list, first);
    callback_list_add(&list, first);

    callback_list_fire(&list);

    TEST_ASSERT_EQUAL_INT(1, s_first_calls);
}

/** @brief A full list refuses the newcomer and says so, rather than overwriting one already there. */
void test_a_full_list_refuses_and_keeps_what_it_has(void)
{
    CallbackListFn entries[1];
    CallbackList list = {entries, 1, 0};
    callback_list_add(&list, first);

    bool result = callback_list_add(&list, second);

    callback_list_fire(&list);
    TEST_ASSERT_FALSE(result);
    TEST_ASSERT_EQUAL_INT(1, s_first_calls);
    TEST_ASSERT_EQUAL_INT(0, s_second_calls);
}

/** @brief A NULL callback is ignored rather than stored, since firing it would crash the watch. */
void test_null_is_ignored(void)
{
    CallbackListFn entries[1];
    CallbackList list = {entries, 1, 0};

    bool result = callback_list_add(&list, NULL);

    TEST_ASSERT_TRUE(result);
    TEST_ASSERT_EQUAL_INT(0, list.count);
}

int main(void)
{
    UNITY_BEGIN();
    RUN_TEST(test_fire_runs_in_the_order_added);
    RUN_TEST(test_adding_twice_keeps_one);
    RUN_TEST(test_a_full_list_refuses_and_keeps_what_it_has);
    RUN_TEST(test_null_is_ignored);
    return UNITY_END();
}
