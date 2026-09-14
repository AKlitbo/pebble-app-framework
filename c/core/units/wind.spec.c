/**
 * @file wind.spec.c
 * @brief Host tests for the wind-speed conversions and labels.
 *
 * Each unit has its own integer factor and the maths truncates rather than rounds, so
 * the factors, the truncation, and the km/h fallback are what these tests pin down.
 */
#include "unity.h"

#include "units/wind.h"

void setUp(void) {}
void tearDown(void) {}

/** @brief 100 km/h is about 62 mph, so a wrong factor would show the wrong gust. */
void test_wind_converts_kmh_to_mph(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_MPH);

    TEST_ASSERT_EQUAL_INT(62, result);
}

/** @brief 100 km/h is about 54 knots, the sailor's reading. */
void test_wind_converts_kmh_to_knots(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_KTS);

    TEST_ASSERT_EQUAL_INT(54, result);
}

/** @brief 100 km/h is about 27 m/s, and the truncation must land on 27 not 28. */
void test_wind_converts_kmh_to_metres_per_second(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_MS);

    TEST_ASSERT_EQUAL_INT(27, result);
}

/** @brief km/h is the source unit so it must pass straight through untouched. */
void test_wind_passes_kmh_straight_through(void)
{
    int result = wind_from_kmh(100, WIND_UNIT_KMH);

    TEST_ASSERT_EQUAL_INT(100, result);
}

/** @brief The maths truncates, so 10 km/h in mph must floor to 6 rather than round to 7. */
void test_wind_truncates_toward_zero(void)
{
    int result = wind_from_kmh(10, WIND_UNIT_MPH);

    TEST_ASSERT_EQUAL_INT(6, result);
}

/** @brief Each unit must carry its own short label or the number sits next to the wrong tag. */
void test_wind_labels_each_unit(void)
{
    const char *kmh = wind_unit_label(WIND_UNIT_KMH);
    const char *mph = wind_unit_label(WIND_UNIT_MPH);
    const char *kts = wind_unit_label(WIND_UNIT_KTS);
    const char *ms = wind_unit_label(WIND_UNIT_MS);

    TEST_ASSERT_EQUAL_STRING("KM/H", kmh);
    TEST_ASSERT_EQUAL_STRING("MPH", mph);
    TEST_ASSERT_EQUAL_STRING("KTS", kts);
    TEST_ASSERT_EQUAL_STRING("M/S", ms);
}

/**
 * @brief A unit value past the known ones still reads as km/h, number and label together.
 *
 * The unit arrives as a raw settings byte. A value the watch does not know leaves the speed in
 * km/h, so the label has to say km/h too, or the panel shows a km/h number tagged as something
 * else.
 */
void test_wind_falls_back_to_kmh_for_an_unknown_unit(void)
{
    int speed = wind_from_kmh(100, WIND_UNIT_COUNT);
    const char *label = wind_unit_label(WIND_UNIT_COUNT);

    TEST_ASSERT_EQUAL_INT(100, speed);
    TEST_ASSERT_EQUAL_STRING("KM/H", label);
}

int main(void)
{
    UNITY_BEGIN();

    RUN_TEST(test_wind_converts_kmh_to_mph);
    RUN_TEST(test_wind_converts_kmh_to_knots);
    RUN_TEST(test_wind_converts_kmh_to_metres_per_second);
    RUN_TEST(test_wind_passes_kmh_straight_through);
    RUN_TEST(test_wind_truncates_toward_zero);
    RUN_TEST(test_wind_labels_each_unit);
    RUN_TEST(test_wind_falls_back_to_kmh_for_an_unknown_unit);

    return UNITY_END();
}
