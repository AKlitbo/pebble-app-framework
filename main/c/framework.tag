<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<tagfile doxygen_version="1.18.0" doxygen_gitid="8e760943e5d9581a444cf327f43a0b4d20d29482">
  <compound kind="file">
    <name>astro.c</name>
    <path>src/c/core/clock/</path>
    <filename>astro_8c.html</filename>
    <includes id="astro_8h" name="astro.h" local="yes" import="no" module="no" objc="no">clock/astro.h</includes>
    <member kind="function">
      <type>int32_t</type>
      <name>astro_jd_centi</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8847a29aa0210773d90c83257417e30d</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>astro.h</name>
    <path>src/c/core/clock/</path>
    <filename>astro_8h.html</filename>
    <member kind="function">
      <type>int32_t</type>
      <name>astro_jd_centi</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8847a29aa0210773d90c83257417e30d</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>beats.c</name>
    <path>src/c/core/clock/</path>
    <filename>beats_8c.html</filename>
    <includes id="beats_8h" name="beats.h" local="yes" import="no" module="no" objc="no">clock/beats.h</includes>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <member kind="function">
      <type>int</type>
      <name>beats_from_ms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga748d1547c38334f1800f0d0bf0ddfb63</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>ms_until_next_beat</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7b06de249c8214693fdf100d868f54f4</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>beats_ms_from_hms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga60ea394a4edab1661bfdfcec61a49a73</anchor>
      <arglist>(int hour, int minute, int second, uint16_t ms)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>beats_has_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaaed371b1b105688cc7ca824ba6ed0090</anchor>
      <arglist>(const char *format)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>beats_expand_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2fdfec41ce1bb098586cf3d82c921cd5</anchor>
      <arglist>(char *text, int beats)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>beats.h</name>
    <path>src/c/core/clock/</path>
    <filename>beats_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>MS_PER_BEAT</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a0d6afbe4b8f974a909bafc6794fc6a55</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MS_PER_DAY</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a252dcc38a8013d69f8a9448187565604</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MS_PER_SEC</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a98c842b52ffe344288b6e38b12417baa</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SECS_PER_DAY</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>ae6bc10904b2b09a717f1fb81cce017de</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SECS_PER_HOUR</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a11528d10d5838afd2d0ec2f5841167cf</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SECS_PER_MIN</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a5e7d1008e5b26253223a67794b77a806</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>BMT_UTC_OFFSET_S</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a9351772e84923ba8b628942ab6b85161</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>BEATS_TOKEN</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>ade6bb8e23f719514ba1b95799c33ca50</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>BEATS_TOKEN_LEN</name>
      <anchorfile>beats_8h.html</anchorfile>
      <anchor>a57ea4ea833a212d20c37d466acf54a09</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>beats_from_ms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga748d1547c38334f1800f0d0bf0ddfb63</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>ms_until_next_beat</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7b06de249c8214693fdf100d868f54f4</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>beats_ms_from_hms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga60ea394a4edab1661bfdfcec61a49a73</anchor>
      <arglist>(int hour, int minute, int second, uint16_t ms)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>beats_has_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaaed371b1b105688cc7ca824ba6ed0090</anchor>
      <arglist>(const char *format)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>beats_expand_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2fdfec41ce1bb098586cf3d82c921cd5</anchor>
      <arglist>(char *text, int beats)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>date.c</name>
    <path>src/c/core/clock/</path>
    <filename>date_8c.html</filename>
    <includes id="date_8h" name="date.h" local="yes" import="no" module="no" objc="no">clock/date.h</includes>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>is_leap</name>
      <anchorfile>date_8c.html</anchorfile>
      <anchor>a506f07c45946335c5ec3a88e78ca5e78</anchor>
      <arglist>(int year)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>dec31_wday</name>
      <anchorfile>date_8c.html</anchorfile>
      <anchor>a1a6b972504fbe2691560543745c1f5ce</anchor>
      <arglist>(int year)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_weeks_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga70f355976c89a7190d80f6d344631710</anchor>
      <arglist>(int year)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>raw_week</name>
      <anchorfile>date_8c.html</anchorfile>
      <anchor>a2ec80a6baceb057022750ccc09a69ac5</anchor>
      <arglist>(int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee874b4db4f19a63aec92cf2c57defd2</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0c190d7c5d5f7d46fc36c3f04bd3e56a</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_day_of_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadde776e9b470fd4e9df1307415b09851</anchor>
      <arglist>(int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_left_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c68f59a1602b5e27b1a05a0d63b499c</anchor>
      <arglist>(int year, int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_in_month</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaef88f0efc2274de9f1984658aea37f9b</anchor>
      <arglist>(int year, int mon0)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_first_wday</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b126160626de63678618d54227455ad</anchor>
      <arglist>(int wday, int mday)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>date.h</name>
    <path>src/c/core/clock/</path>
    <filename>date_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee874b4db4f19a63aec92cf2c57defd2</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0c190d7c5d5f7d46fc36c3f04bd3e56a</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_weeks_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga70f355976c89a7190d80f6d344631710</anchor>
      <arglist>(int year)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_day_of_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadde776e9b470fd4e9df1307415b09851</anchor>
      <arglist>(int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_left_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c68f59a1602b5e27b1a05a0d63b499c</anchor>
      <arglist>(int year, int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_in_month</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaef88f0efc2274de9f1984658aea37f9b</anchor>
      <arglist>(int year, int mon0)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_first_wday</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b126160626de63678618d54227455ad</anchor>
      <arglist>(int wday, int mday)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>duration.c</name>
    <path>src/c/core/clock/</path>
    <filename>duration_8c.html</filename>
    <includes id="duration_8h" name="duration.h" local="yes" import="no" module="no" objc="no">clock/duration.h</includes>
    <member kind="function">
      <type>void</type>
      <name>duration_hm</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4fe493c620f4247fb241b538db2aec72</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>duration_hm_compact</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b34387761f2f9297553dcad5ac0f206</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>duration.h</name>
    <path>src/c/core/clock/</path>
    <filename>duration_8h.html</filename>
    <member kind="function">
      <type>void</type>
      <name>duration_hm</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4fe493c620f4247fb241b538db2aec72</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>duration_hm_compact</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b34387761f2f9297553dcad5ac0f206</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>moon.c</name>
    <path>src/c/core/clock/</path>
    <filename>moon_8c.html</filename>
    <includes id="moon_8h" name="moon.h" local="yes" import="no" module="no" objc="no">clock/moon.h</includes>
    <member kind="function">
      <type>int32_t</type>
      <name>moon_age_sec</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf635be67f90fcbcc72361db3e1b899e0</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_glyph_index</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga83dfa9388ce19b76dd9f18ffc9135a67</anchor>
      <arglist>(time_t utc, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_illumination_pct</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa3fa4262c82f6312ffc7ac9a36ad08e1</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_days_to_phase</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c81c549c8dfe4c2751f023abfe727b7</anchor>
      <arglist>(time_t utc, bool to_full)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>moon_phase_name</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6a99ed843383ec7d057306db91bb91fc</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>moon.h</name>
    <path>src/c/core/clock/</path>
    <filename>moon_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>MOON_SYNODIC_SEC</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga550e4dc38f3305d3ad3dcd0dd394de94</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MOON_EPOCH_UTC</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf586f63d0905b47c9548a10f0310bc81</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>moon_age_sec</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf635be67f90fcbcc72361db3e1b899e0</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_glyph_index</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga83dfa9388ce19b76dd9f18ffc9135a67</anchor>
      <arglist>(time_t utc, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_illumination_pct</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa3fa4262c82f6312ffc7ac9a36ad08e1</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>moon_phase_name</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6a99ed843383ec7d057306db91bb91fc</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_days_to_phase</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c81c549c8dfe4c2751f023abfe727b7</anchor>
      <arglist>(time_t utc, bool to_full)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>nightsched.c</name>
    <path>src/c/core/clock/</path>
    <filename>nightsched_8c.html</filename>
    <includes id="nightsched_8h" name="nightsched.h" local="yes" import="no" module="no" objc="no">nightsched.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>DAY_MINUTES</name>
      <anchorfile>nightsched_8c.html</anchorfile>
      <anchor>a27eb45d73274b31b564ec5e27236b745</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>is_reading</name>
      <anchorfile>nightsched_8c.html</anchorfile>
      <anchor>a840b33a21a7d32f781afb123a040d488</anchor>
      <arglist>(int minute)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>clock_window_contains</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga284e05094c9084b2fca021122f13488d</anchor>
      <arglist>(int start, int end, int now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>night_schedule_active</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gab655e624866f012b97621268f0038504</anchor>
      <arglist>(int mode, int now, int rise, int set, int fixed_start, int fixed_end, bool have_night)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>nightsched.h</name>
    <path>src/c/core/clock/</path>
    <filename>nightsched_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>NightSchedMode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga90cd678ac8db70a4a741a5ef04cd8793</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_OFF</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a6a8c99fc2f822c3b640066f69ce2d997</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_SOLAR</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a0ff4de0039a79b3e04a3052f98707a73</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_FIXED</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a8c275a9c35ee2c3bb0d2875a56b2b8be</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>clock_window_contains</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga284e05094c9084b2fca021122f13488d</anchor>
      <arglist>(int start, int end, int now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>night_schedule_active</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gab655e624866f012b97621268f0038504</anchor>
      <arglist>(int mode, int now, int rise, int set, int fixed_start, int fixed_end, bool have_night)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>solar.c</name>
    <path>src/c/core/clock/</path>
    <filename>solar_8c.html</filename>
    <includes id="solar_8h" name="solar.h" local="yes" import="no" module="no" objc="no">clock/solar.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>MINUTES_PER_DAY</name>
      <anchorfile>solar_8c.html</anchorfile>
      <anchor>ae0f73032b15f3188a50b86f793afb7ab</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>have_all</name>
      <anchorfile>solar_8c.html</anchorfile>
      <anchor>a854b4a35a11cda25892a46e24e0b8e0c</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>forward</name>
      <anchorfile>solar_8c.html</anchorfile>
      <anchor>abc2880e1e3accfcb789382afc39f0a78</anchor>
      <arglist>(int from, int to)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_day_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac982a31420ab76dbaa86ab1885c065ad</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_night_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee0b6058425e523d5393b77aceb34a54</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_next_event</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga974fb27e5854c3558a46a423c0e9e621</anchor>
      <arglist>(int rise, int set, int now, bool *is_sunrise)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>solar.h</name>
    <path>src/c/core/clock/</path>
    <filename>solar_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>solar_day_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac982a31420ab76dbaa86ab1885c065ad</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_night_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee0b6058425e523d5393b77aceb34a54</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_next_event</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga974fb27e5854c3558a46a423c0e9e621</anchor>
      <arglist>(int rise, int set, int now, bool *is_sunrise)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>tide.c</name>
    <path>src/c/core/clock/</path>
    <filename>tide_8c.html</filename>
    <includes id="tide_8h" name="tide.h" local="yes" import="no" module="no" objc="no">clock/tide.h</includes>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>phase</name>
      <anchorfile>tide_8c.html</anchorfile>
      <anchor>a08bf10e5ba17a2c669e2cc0a45d7bfaa</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>tide_level</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ca1c1d9a5df71a89fc61da050ca3b8d</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>tide_rising</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga910d5986818e759ad59e4e50cefdbe8f</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>tide.h</name>
    <path>src/c/core/clock/</path>
    <filename>tide_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>TIDE_PERIOD_MIN</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa01e1adc5b81c1d2cc14f870a42e5f3f</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>tide_level</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ca1c1d9a5df71a89fc61da050ca3b8d</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>tide_rising</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga910d5986818e759ad59e4e50cefdbe8f</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>timeband.c</name>
    <path>src/c/core/clock/</path>
    <filename>timeband_8c.html</filename>
    <includes id="timeband_8h" name="timeband.h" local="yes" import="no" module="no" objc="no">clock/timeband.h</includes>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>SECONDS_PER_MINUTE</name>
      <anchorfile>timeband_8c.html</anchorfile>
      <anchor>ae5e089b553f791f79d02046ff63f3cdb</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>wrap_day</name>
      <anchorfile>timeband_8c.html</anchorfile>
      <anchor>a53741af02acdd92c6c86ff7ec2e9656b</anchor>
      <arglist>(int minutes)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>floor_minutes</name>
      <anchorfile>timeband_8c.html</anchorfile>
      <anchor>a8e06291a2bccc7a786852acbf98622af</anchor>
      <arglist>(int seconds)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>ceil_minutes</name>
      <anchorfile>timeband_8c.html</anchorfile>
      <anchor>a2d5083d8663f9050b440ca1e555a108c</anchor>
      <arglist>(int seconds)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_full_day</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2e4ca30c1616284c941596b66bcc6158</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_rolling</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga17975bf89798eeb2baacffec94111b18</anchor>
      <arglist>(int now_min, int span_min, int lead_min)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_from_hour</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga1e2241cf9d353b6c48f57c9e49dbcbe9</anchor>
      <arglist>(int base_hour, int span_min)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac788ab450b30bbb9e4c0c16e2a96d1de</anchor>
      <arglist>(TimeBand band, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4d0f6578d1e429d7c77be357109a6989</anchor>
      <arglist>(TimeBand band, int length, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga464dfe5bbece0af2f5539d0616fd7643</anchor>
      <arglist>(TimeBand band, int length, int offset_min)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>timeband_clip</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0a00805862511df587e96edc9083c7da</anchor>
      <arglist>(TimeBand band, time_t window_epoch, time_t start, time_t end, TimeBandSpan *out)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_clip_daily</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7ec5edf0ceeb305eed2d84da3130a0ba</anchor>
      <arglist>(TimeBand band, int from_min, int to_min, TimeBandSpan *out, int max_out)</arglist>
    </member>
    <member kind="function">
      <type>time_t</type>
      <name>timeband_window_epoch</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga63e7a4d00b37b74522dc6eaab727b6f8</anchor>
      <arglist>(TimeBand band, time_t now, int now_min)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>timeband.h</name>
    <path>src/c/core/clock/</path>
    <filename>timeband_8h.html</filename>
    <class kind="struct">TimeBand</class>
    <class kind="struct">TimeBandSpan</class>
    <member kind="define">
      <type>#define</type>
      <name>TIMEBAND_DAY_MINUTES</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad3c2b297779efc19aa0c02f2e8635917</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_full_day</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2e4ca30c1616284c941596b66bcc6158</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_rolling</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga17975bf89798eeb2baacffec94111b18</anchor>
      <arglist>(int now_min, int span_min, int lead_min)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_from_hour</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga1e2241cf9d353b6c48f57c9e49dbcbe9</anchor>
      <arglist>(int base_hour, int span_min)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac788ab450b30bbb9e4c0c16e2a96d1de</anchor>
      <arglist>(TimeBand band, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4d0f6578d1e429d7c77be357109a6989</anchor>
      <arglist>(TimeBand band, int length, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga464dfe5bbece0af2f5539d0616fd7643</anchor>
      <arglist>(TimeBand band, int length, int offset_min)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>timeband_clip</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0a00805862511df587e96edc9083c7da</anchor>
      <arglist>(TimeBand band, time_t window_epoch, time_t start, time_t end, TimeBandSpan *out)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_clip_daily</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7ec5edf0ceeb305eed2d84da3130a0ba</anchor>
      <arglist>(TimeBand band, int from_min, int to_min, TimeBandSpan *out, int max_out)</arglist>
    </member>
    <member kind="function">
      <type>time_t</type>
      <name>timeband_window_epoch</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga63e7a4d00b37b74522dc6eaab727b6f8</anchor>
      <arglist>(TimeBand band, time_t now, int now_min)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weekday.c</name>
    <path>src/c/core/clock/</path>
    <filename>weekday_8c.html</filename>
    <includes id="weekday_8h" name="weekday.h" local="yes" import="no" module="no" objc="no">clock/weekday.h</includes>
    <member kind="function">
      <type>const char *</type>
      <name>weekday_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadccedafdeb6e437c664e8426bfd9812b</anchor>
      <arglist>(int wday)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weekday.h</name>
    <path>src/c/core/clock/</path>
    <filename>weekday_8h.html</filename>
    <member kind="function">
      <type>const char *</type>
      <name>weekday_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadccedafdeb6e437c664e8426bfd9812b</anchor>
      <arglist>(int wday)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>zone_setting.c</name>
    <path>src/c/core/clock/</path>
    <filename>zone__setting_8c.html</filename>
    <includes id="zone__setting_8h" name="zone_setting.h" local="yes" import="no" module="no" objc="no">clock/zone_setting.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>zone_setting_is_set</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga48a1bec6aa209e10ce939af6b9d53222</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>int16_t</type>
      <name>zone_setting_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6654376c135443aa4f6756f406340f02</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>zone_setting_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9f625161eafd8ce62405cce899c8ff80</anchor>
      <arglist>(const char *value)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>zone_setting.h</name>
    <path>src/c/core/clock/</path>
    <filename>zone__setting_8h.html</filename>
    <member kind="function">
      <type>bool</type>
      <name>zone_setting_is_set</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga48a1bec6aa209e10ce939af6b9d53222</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>int16_t</type>
      <name>zone_setting_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6654376c135443aa4f6756f406340f02</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>zone_setting_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9f625161eafd8ce62405cce899c8ff80</anchor>
      <arglist>(const char *value)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>minute_window.c</name>
    <path>src/c/core/health/</path>
    <filename>minute__window_8c.html</filename>
    <includes id="minute__window_8h" name="minute_window.h" local="yes" import="no" module="no" objc="no">health/minute_window.h</includes>
    <member kind="function">
      <type>int</type>
      <name>minute_window_first_slot</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf7d993bee5b11fc9f9ea5918d9f7d991</anchor>
      <arglist>(time_t first_min, time_t end_min, int minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>minute_window.h</name>
    <path>src/c/core/health/</path>
    <filename>minute__window_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>minute_window_first_slot</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf7d993bee5b11fc9f9ea5918d9f7d991</anchor>
      <arglist>(time_t first_min, time_t end_min, int minutes)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>step_hours.c</name>
    <path>src/c/core/health/</path>
    <filename>step__hours_8c.html</filename>
    <includes id="step__hours_8h" name="step_hours.h" local="yes" import="no" module="no" objc="no">health/step_hours.h</includes>
    <member kind="function">
      <type>int</type>
      <name>step_hours_settled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga998d8f2fe2b302cdff2610abd009f245</anchor>
      <arglist>(int cur_hour, int cur_min)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>step_hours.h</name>
    <path>src/c/core/health/</path>
    <filename>step__hours_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>STEP_HOURS_PER_DAY</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gab582a8ca15586973977cd7f48de42fa2</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>step_hours_settled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga998d8f2fe2b302cdff2610abd009f245</anchor>
      <arglist>(int cur_hour, int cur_min)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>bytes_le.h</name>
    <path>src/c/core/io/</path>
    <filename>bytes__le_8h.html</filename>
    <member kind="function" static="yes">
      <type>static int16_t</type>
      <name>read_i16_le</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3fd54f4514af9738e081706d21fd44bc</anchor>
      <arglist>(const uint8_t *p)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>read_i32_le</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7ac2e494355ca66ce8ec8bbd881e90e9</anchor>
      <arglist>(const uint8_t *p)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>callback_list.c</name>
    <path>src/c/core/io/</path>
    <filename>callback__list_8c.html</filename>
    <includes id="callback__list_8h" name="callback_list.h" local="yes" import="no" module="no" objc="no">io/callback_list.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>callback_list_add</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaed0238885522c47e90f7a547719983bc</anchor>
      <arglist>(CallbackList *list, CallbackListFn cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>callback_list_fire</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6b4dbe785f6d28d845b326a152444ddd</anchor>
      <arglist>(const CallbackList *list)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>callback_list.h</name>
    <path>src/c/core/io/</path>
    <filename>callback__list_8h.html</filename>
    <class kind="struct">CallbackList</class>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CallbackListFn</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gace9c32cbf32397ccc0a34a750ce3ea68</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>callback_list_add</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaed0238885522c47e90f7a547719983bc</anchor>
      <arglist>(CallbackList *list, CallbackListFn cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>callback_list_fire</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6b4dbe785f6d28d845b326a152444ddd</anchor>
      <arglist>(const CallbackList *list)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>layout_role.c</name>
    <path>src/c/core/layout/</path>
    <filename>layout__role_8c.html</filename>
    <includes id="layout__role_8h" name="layout_role.h" local="yes" import="no" module="no" objc="no">layout_role.h</includes>
    <member kind="function">
      <type>LayoutRole</type>
      <name>layout_role_pick</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga483c460c27f1f46834ac736434668598</anchor>
      <arglist>(bool quiet_on, bool quiet_set, bool night_on, bool night_set)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>layout_role.h</name>
    <path>src/c/core/layout/</path>
    <filename>layout__role_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>LayoutRole</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gacc6a111ebb7ba5e35f9c1946e436943f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_DAY</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa61de7d05aeb87ca0661859381a064971</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_NIGHT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa19e9e96220840a3831e03b59067e9be5</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_QUIET</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa518cbe3bd0c7d438b484dc05afc5c11e</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>LayoutRole</type>
      <name>layout_role_pick</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga483c460c27f1f46834ac736434668598</anchor>
      <arglist>(bool quiet_on, bool quiet_set, bool night_on, bool night_set)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>layout_string.c</name>
    <path>src/c/core/layout/</path>
    <filename>layout__string_8c.html</filename>
    <includes id="layout__string_8h" name="layout_string.h" local="yes" import="no" module="no" objc="no">layout_string.h</includes>
    <member kind="function">
      <type>int</type>
      <name>layout_parse_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6de1604c8d0aab3e3a3226dccb171cce</anchor>
      <arglist>(const char **cursor)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>layout_has_any_block</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadb8a7e98c9c67c5167942ae96433c21f</anchor>
      <arglist>(const char *layout, int type_count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>layout_string.h</name>
    <path>src/c/core/layout/</path>
    <filename>layout__string_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>LAYOUT_INT_MAX</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga19726e59e3c59c41210823d2d3dac836</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>layout_parse_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6de1604c8d0aab3e3a3226dccb171cce</anchor>
      <arglist>(const char **cursor)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>layout_has_any_block</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadb8a7e98c9c67c5167942ae96433c21f</anchor>
      <arglist>(const char *layout, int type_count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>pct.c</name>
    <path>src/c/core/math/</path>
    <filename>pct_8c.html</filename>
    <includes id="pct_8h" name="pct.h" local="yes" import="no" module="no" objc="no">math/pct.h</includes>
    <member kind="function">
      <type>int</type>
      <name>pct_of</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0fa2f5ff0207c0179c689d0277bdfffd</anchor>
      <arglist>(int value, int goal)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>pct.h</name>
    <path>src/c/core/math/</path>
    <filename>pct_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>pct_of</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0fa2f5ff0207c0179c689d0277bdfffd</anchor>
      <arglist>(int value, int goal)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>scale.c</name>
    <path>src/c/core/math/</path>
    <filename>scale_8c.html</filename>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <member kind="function">
      <type>int</type>
      <name>clamp_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2a3f6820b74bffadc7d6f3b88eb4916d</anchor>
      <arglist>(int value, int lo, int hi)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segment_width</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac01ee128d72ea0af440967d27c4de224</anchor>
      <arglist>(int total, int gap, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>fraction_px</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ed357804da26e96f0ae19aa3d02873f</anchor>
      <arglist>(int total, int num, int den)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segments_filled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga5e3c99e7f2fade51632dd8aa3f3988f0</anchor>
      <arglist>(int level, int segments)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>plot_y</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadc6c8c4764edd2d25babbc4689eaa73b</anchor>
      <arglist>(int y0, int height, int lo, int hi, int value)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>scale.h</name>
    <path>src/c/core/math/</path>
    <filename>scale_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>clamp_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2a3f6820b74bffadc7d6f3b88eb4916d</anchor>
      <arglist>(int value, int lo, int hi)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segment_width</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac01ee128d72ea0af440967d27c4de224</anchor>
      <arglist>(int total, int gap, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>fraction_px</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ed357804da26e96f0ae19aa3d02873f</anchor>
      <arglist>(int total, int num, int den)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segments_filled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga5e3c99e7f2fade51632dd8aa3f3988f0</anchor>
      <arglist>(int level, int segments)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>plot_y</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadc6c8c4764edd2d25babbc4689eaa73b</anchor>
      <arglist>(int y0, int height, int lo, int hi, int value)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>series.c</name>
    <path>src/c/core/math/</path>
    <filename>series_8c.html</filename>
    <includes id="series_8h" name="series.h" local="yes" import="no" module="no" objc="no">math/series.h</includes>
    <member kind="function">
      <type>int</type>
      <name>series_range</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4260de92aa2412a987a0d0ee799d5406</anchor>
      <arglist>(const uint8_t *samples, int count, uint8_t no_sample, int *lo, int *hi, int *last)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>series_max_u16</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8cc817ecf16f05e721472b4f6714943a</anchor>
      <arglist>(const uint16_t *values, int count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>series.h</name>
    <path>src/c/core/math/</path>
    <filename>series_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>series_range</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4260de92aa2412a987a0d0ee799d5406</anchor>
      <arglist>(const uint8_t *samples, int count, uint8_t no_sample, int *lo, int *hi, int *last)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>series_max_u16</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8cc817ecf16f05e721472b4f6714943a</anchor>
      <arglist>(const uint16_t *values, int count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>cstring_fit.h</name>
    <path>src/c/core/text/</path>
    <filename>cstring__fit_8h.html</filename>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cstring_fit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga48dcd72e49fa122dc562f64605efdc75</anchor>
      <arglist>(char *dst, const char *src, size_t size)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>cstring_fit_same</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga13d8bf38f7877df6836f074354b4bcb9</anchor>
      <arglist>(const char *current, const char *value, size_t size)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>number_format.c</name>
    <path>src/c/core/text/</path>
    <filename>number__format_8c.html</filename>
    <includes id="number__format_8h" name="number_format.h" local="yes" import="no" module="no" objc="no">text/number_format.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <member kind="function" static="yes">
      <type>static unsigned int</type>
      <name>magnitude_of</name>
      <anchorfile>number__format_8c.html</anchorfile>
      <anchor>a4adab5526b64c59384538f303559a94f</anchor>
      <arglist>(int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>number_group</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3633a279bf5254234b2a8549d98e80de</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_int_or_dash</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga145e042f4414e0854e809ac7c7b086ca</anchor>
      <arglist>(char *buffer, size_t size, int value, const char *fmt)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_hundredths</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafa9f63d99d2011c46da1397b798fc529</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_pct_signed</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad8460f42bd55675f97ac3b2feae4fde0</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>copy_bounded</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2d2900400e9b136d9d176de8838c52a4</anchor>
      <arglist>(char *dst, uint8_t cap, const uint8_t *src, uint8_t len)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6334eca7eb0a33cdf25b1bb9060afa35</anchor>
      <arglist>(const char *s, uint16_t size)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_setting_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga58af7628a1a740a9fb7a220b3a472c22</anchor>
      <arglist>(const char *s, uint16_t size, const char *default_str)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>number_format.h</name>
    <path>src/c/core/text/</path>
    <filename>number__format_8h.html</filename>
    <member kind="function">
      <type>void</type>
      <name>number_group</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3633a279bf5254234b2a8549d98e80de</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_int_or_dash</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga145e042f4414e0854e809ac7c7b086ca</anchor>
      <arglist>(char *buffer, size_t size, int value, const char *fmt)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_hundredths</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafa9f63d99d2011c46da1397b798fc529</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_pct_signed</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad8460f42bd55675f97ac3b2feae4fde0</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>copy_bounded</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2d2900400e9b136d9d176de8838c52a4</anchor>
      <arglist>(char *dst, uint8_t cap, const uint8_t *src, uint8_t len)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6334eca7eb0a33cdf25b1bb9060afa35</anchor>
      <arglist>(const char *s, uint16_t size)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_setting_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga58af7628a1a740a9fb7a220b3a472c22</anchor>
      <arglist>(const char *s, uint16_t size, const char *default_str)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>text_case.c</name>
    <path>src/c/core/text/</path>
    <filename>text__case_8c.html</filename>
    <includes id="text__case_8h" name="text_case.h" local="yes" import="no" module="no" objc="no">text/text_case.h</includes>
    <member kind="function">
      <type>void</type>
      <name>text_to_upper</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0f128dcb6dbe22caba62e2b47c1da00a</anchor>
      <arglist>(char *s)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>text_case.h</name>
    <path>src/c/core/text/</path>
    <filename>text__case_8h.html</filename>
    <member kind="function">
      <type>void</type>
      <name>text_to_upper</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0f128dcb6dbe22caba62e2b47c1da00a</anchor>
      <arglist>(char *s)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>distance.c</name>
    <path>src/c/core/units/</path>
    <filename>distance_8c.html</filename>
    <includes id="distance_8h" name="distance.h" local="yes" import="no" module="no" objc="no">units/distance.h</includes>
    <member kind="function">
      <type>const char *</type>
      <name>distance_unit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadad9778fe90b71058c77ee83f2f26e2e</anchor>
      <arglist>(bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format_value</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga93901c7cecf40133c250e13cf5cdb4bd</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadf1a4e77db17b89d4d0e81dc25c9bcf2</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>distance.h</name>
    <path>src/c/core/units/</path>
    <filename>distance_8h.html</filename>
    <member kind="function">
      <type>const char *</type>
      <name>distance_unit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadad9778fe90b71058c77ee83f2f26e2e</anchor>
      <arglist>(bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format_value</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga93901c7cecf40133c250e13cf5cdb4bd</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadf1a4e77db17b89d4d0e81dc25c9bcf2</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wind.c</name>
    <path>src/c/core/units/</path>
    <filename>wind_8c.html</filename>
    <includes id="wind_8h" name="wind.h" local="yes" import="no" module="no" objc="no">units/wind.h</includes>
    <member kind="function">
      <type>int</type>
      <name>wind_from_kmh</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga56c983dede8e0be266f38d389a62c371</anchor>
      <arglist>(int kmh, WindUnit unit)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>wind_unit_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd0dc1755ed3d4dd661c56e5c498e84d</anchor>
      <arglist>(WindUnit unit)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wind.h</name>
    <path>src/c/core/units/</path>
    <filename>wind_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>WindUnit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga81835140b8dd390d395cd5fcf7dee1b1</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_KMH</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1aa05ca61b7909a966d95caac6d27dc51c</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_MPH</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a3d492848e908a0c4425a669ee67ee63b</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_KTS</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a60a6d323d0f94b93a78fc02d92b6545d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_MS</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1ae2b15fe48410daeee405fc533127c566</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_COUNT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a93a87520ef04d333e59aced98692a2ea</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_from_kmh</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga56c983dede8e0be266f38d389a62c371</anchor>
      <arglist>(int kmh, WindUnit unit)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>wind_unit_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd0dc1755ed3d4dd661c56e5c498e84d</anchor>
      <arglist>(WindUnit unit)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>forecast_age.c</name>
    <path>src/c/core/weather/</path>
    <filename>forecast__age_8c.html</filename>
    <includes id="forecast__age_8h" name="forecast_age.h" local="yes" import="no" module="no" objc="no">weather/forecast_age.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>SECONDS_PER_STRIP_HOUR</name>
      <anchorfile>forecast__age_8c.html</anchorfile>
      <anchor>a8a1220c950f394ac58e88c710867cee6</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_hours_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga39e6efbba632aacf61875379354b1c38</anchor>
      <arglist>(int32_t seconds_into_strip, uint8_t step_hours, uint8_t count)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_days_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2f750b53c34d89db9ce79a2a252ebf02</anchor>
      <arglist>(int days_since_first, uint8_t count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>forecast_age.h</name>
    <path>src/c/core/weather/</path>
    <filename>forecast__age_8h.html</filename>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_hours_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga39e6efbba632aacf61875379354b1c38</anchor>
      <arglist>(int32_t seconds_into_strip, uint8_t step_hours, uint8_t count)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_days_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2f750b53c34d89db9ce79a2a252ebf02</anchor>
      <arglist>(int days_since_first, uint8_t count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_reading.c</name>
    <path>src/c/core/weather/</path>
    <filename>weather__reading_8c.html</filename>
    <includes id="weather__reading_8h" name="weather_reading.h" local="yes" import="no" module="no" objc="no">weather/weather_reading.h</includes>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>SECONDS_PER_READING_HOUR</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a267f1d53840a807dc520f94916fc4a48</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SECONDS_PER_READING_DAY</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a2ccfb51424caf466f42400933fc530ae</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MINUTES_PER_READING_DAY</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a69b123c097f7af6d5901cefdaa36c6b9</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>or_none</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>aefa5e1e7ffa9129d5821b0d9f1fd1528</anchor>
      <arglist>(int value, int none)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int16_t</type>
      <name>day_minute_or_none</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a1c25fcbdfd7f19ec1bea9883c94008a0</anchor>
      <arglist>(int value)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_reading_apply</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2b36f0d71ccc983475ea5fa5e919e585</anchor>
      <arglist>(WeatherState *state, const WeatherMessage *msg, const WeatherClock *clock)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>div_nearest</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a9a52c6548cc6d6a82999ec4c65bef6ad</anchor>
      <arglist>(int numerator, int denominator)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>convert_temp</name>
      <anchorfile>weather__reading_8c.html</anchorfile>
      <anchor>a330fe5a1f08af20a13441fb826bbb00b</anchor>
      <arglist>(int value, bool to_fahrenheit)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_reading_convert</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6fcabd81132c73ba225beaf6f035fe5c</anchor>
      <arglist>(WeatherState *state, bool to_fahrenheit)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_reading.h</name>
    <path>src/c/core/weather/</path>
    <filename>weather__reading_8h.html</filename>
    <includes id="weather__wire_8h" name="weather_wire.h" local="yes" import="no" module="no" objc="no">wire/weather_wire.h</includes>
    <class kind="struct">WeatherMessage</class>
    <class kind="struct">WeatherState</class>
    <class kind="struct">WeatherClock</class>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_CURRENT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gace94f04d01ec6679143f9937fc0d7d35</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_EXTRA</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad2a50305c20a2dc3acf340c9837a065b</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_FORECAST</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7eef9602c89fd58adb11e058618d1dd7</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_AIR</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga49eb8281314392449d74706359777576</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_reading_apply</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2b36f0d71ccc983475ea5fa5e919e585</anchor>
      <arglist>(WeatherState *state, const WeatherMessage *msg, const WeatherClock *clock)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_reading_convert</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6fcabd81132c73ba225beaf6f035fe5c</anchor>
      <arglist>(WeatherState *state, bool to_fahrenheit)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wind_dir.c</name>
    <path>src/c/core/weather/</path>
    <filename>wind__dir_8c.html</filename>
    <includes id="wind__dir_8h" name="wind_dir.h" local="yes" import="no" module="no" objc="no">weather/wind_dir.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>POINT_COUNT</name>
      <anchorfile>wind__dir_8c.html</anchorfile>
      <anchor>ae4c22bd55836cfbafd815744656a35d6</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>same_point</name>
      <anchorfile>wind__dir_8c.html</anchorfile>
      <anchor>abc8fa95a19e620685d08ceb068af93da</anchor>
      <arglist>(const char *a, const char *b)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>sin_milli</name>
      <anchorfile>wind__dir_8c.html</anchorfile>
      <anchor>aa7482b792506f560fb3194367a85ac91</anchor>
      <arglist>(int degrees)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_bearing</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf6fadf25dfa1b520911598ccade94119</anchor>
      <arglist>(const char *dir)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_lean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga357ae2f2cfb0a32380b717e9a8ac6ce8</anchor>
      <arglist>(int bearing)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wind_dir.h</name>
    <path>src/c/core/weather/</path>
    <filename>wind__dir_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>wind_bearing</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf6fadf25dfa1b520911598ccade94119</anchor>
      <arglist>(const char *dir)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_lean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga357ae2f2cfb0a32380b717e9a8ac6ce8</anchor>
      <arglist>(int bearing)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wx_label.c</name>
    <path>src/c/core/weather/</path>
    <filename>wx__label_8c.html</filename>
    <includes id="wx__label_8h" name="wx_label.h" local="yes" import="no" module="no" objc="no">weather/wx_label.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>NIGHT_SUFFIX</name>
      <anchorfile>wx__label_8c.html</anchorfile>
      <anchor>a142623ea8af52221e0a4fe4308628e27</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>NIGHT_SUFFIX_LEN</name>
      <anchorfile>wx__label_8c.html</anchorfile>
      <anchor>af1abbd67514bbd585d16b07b69a02eb7</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>wx_label_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga174ee20c1de042aac051cdc44dc9847a</anchor>
      <arglist>(char *out, size_t n, const char *condition)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wx_label.h</name>
    <path>src/c/core/weather/</path>
    <filename>wx__label_8h.html</filename>
    <member kind="function">
      <type>void</type>
      <name>wx_label_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga174ee20c1de042aac051cdc44dc9847a</anchor>
      <arglist>(char *out, size_t n, const char *condition)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>calendar_wire.c</name>
    <path>src/c/core/wire/</path>
    <filename>calendar__wire_8c.html</filename>
    <includes id="calendar__wire_8h" name="calendar_wire.h" local="yes" import="no" module="no" objc="no">wire/calendar_wire.h</includes>
    <includes id="bytes__le_8h" name="bytes_le.h" local="yes" import="no" module="no" objc="no">io/bytes_le.h</includes>
    <includes id="number__format_8h" name="number_format.h" local="yes" import="no" module="no" objc="no">text/number_format.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>calendar_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd03d47d8eb87604abcd082423036833</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, CalendarStrip *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>calendar_wire.h</name>
    <path>src/c/core/wire/</path>
    <filename>calendar__wire_8h.html</filename>
    <includes id="wire__caps_8g_8h" name="wire_caps.g.h" local="yes" import="no" module="no" objc="no">wire/wire_caps.g.h</includes>
    <class kind="struct">CalendarEvent</class>
    <class kind="struct">CalendarStrip</class>
    <member kind="function">
      <type>bool</type>
      <name>calendar_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd03d47d8eb87604abcd082423036833</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, CalendarStrip *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>coords.c</name>
    <path>src/c/core/wire/</path>
    <filename>coords_8c.html</filename>
    <includes id="coords_8h" name="coords.h" local="yes" import="no" module="no" objc="no">wire/coords.h</includes>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>has_digit</name>
      <anchorfile>coords_8c.html</anchorfile>
      <anchor>ac1e67c56d6798c13c193444920f5b4dd</anchor>
      <arglist>(const char *s)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>coords_look_real</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga11b6bfbd1863803faf31b81bdea9ef1f</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>coords.h</name>
    <path>src/c/core/wire/</path>
    <filename>coords_8h.html</filename>
    <member kind="function">
      <type>bool</type>
      <name>coords_look_real</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga11b6bfbd1863803faf31b81bdea9ef1f</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>stock_wire.c</name>
    <path>src/c/core/wire/</path>
    <filename>stock__wire_8c.html</filename>
    <includes id="stock__wire_8h" name="stock_wire.h" local="yes" import="no" module="no" objc="no">wire/stock_wire.h</includes>
    <includes id="bytes__le_8h" name="bytes_le.h" local="yes" import="no" module="no" objc="no">io/bytes_le.h</includes>
    <includes id="number__format_8h" name="number_format.h" local="yes" import="no" module="no" objc="no">text/number_format.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>stock_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gacaf9695fcec823203cf5c23309448d8f</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, StockStrip *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>stock_wire.h</name>
    <path>src/c/core/wire/</path>
    <filename>stock__wire_8h.html</filename>
    <includes id="wire__caps_8g_8h" name="wire_caps.g.h" local="yes" import="no" module="no" objc="no">wire/wire_caps.g.h</includes>
    <class kind="struct">StockSlot</class>
    <class kind="struct">StockStrip</class>
    <member kind="function">
      <type>bool</type>
      <name>stock_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gacaf9695fcec823203cf5c23309448d8f</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, StockStrip *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_wire.c</name>
    <path>src/c/core/wire/</path>
    <filename>weather__wire_8c.html</filename>
    <includes id="weather__wire_8h" name="weather_wire.h" local="yes" import="no" module="no" objc="no">wire/weather_wire.h</includes>
    <includes id="bytes__le_8h" name="bytes_le.h" local="yes" import="no" module="no" objc="no">io/bytes_le.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>weather_hourly_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa8a79a3914a591d37a2080d4a9c2dd86</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherHourly *out)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_daily_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac4fcf3a860dea22cf18924b3c4783405</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherDaily *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_wire.h</name>
    <path>src/c/core/wire/</path>
    <filename>weather__wire_8h.html</filename>
    <includes id="wire__caps_8g_8h" name="wire_caps.g.h" local="yes" import="no" module="no" objc="no">wire/wire_caps.g.h</includes>
    <class kind="struct">WeatherHourCol</class>
    <class kind="struct">WeatherDayCol</class>
    <class kind="struct">WeatherHourly</class>
    <class kind="struct">WeatherDaily</class>
    <member kind="function">
      <type>bool</type>
      <name>weather_hourly_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa8a79a3914a591d37a2080d4a9c2dd86</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherHourly *out)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_daily_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac4fcf3a860dea22cf18924b3c4783405</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherDaily *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wire_caps.g.h</name>
    <path>src/c/core/wire/</path>
    <filename>wire__caps_8g_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>STOCK_MAX_SLOTS</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>aa30008256f21f16b5c000b4f358a1709</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STOCK_SYMBOL_LEN</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>a12ebf366686d792fba83b752e39cb3f9</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>CALENDAR_MAX_SLOTS</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>abce35d4e05b918ebdb339cfbf8c87be2</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>CAL_TITLE_LEN</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>aa8d4ff63a367c308464fcb26b8cadd02</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>CAL_LOC_LEN</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>a2fce7543ff5feb8ce5149d89adbd38d8</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_FORECAST_COLS</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>a102929a83f0e748a60db5079d778b530</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_NO_TEMP</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>ad0b45ae6054fd351cb661c9732c85f49</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WX_FORECAST_NIGHT_BIT</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>abc4a5b3638a2e2195948cc82481cc705</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SETTINGS_REQUEST_FULL</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>a64a4a567320a2aa7601c97c663e9a399</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>SETTINGS_REQUEST_FRESH</name>
      <anchorfile>wire__caps_8g_8h.html</anchorfile>
      <anchor>af3f7cd976bebfe18d94f7bd7ba7f0c6c</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>wire_read.h</name>
    <path>src/c/core/wire/</path>
    <filename>wire__read_8h.html</filename>
    <includes id="bytes__le_8h" name="bytes_le.h" local="yes" import="no" module="no" objc="no">io/bytes_le.h</includes>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>wire_int_or</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaac313f9ba01fb8da75be8388287f9a7a</anchor>
      <arglist>(bool is_signed, uint16_t length, const uint8_t *value, int32_t fallback)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>wire_cstring_terminated</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga700d7a3380b25b5472c1b580502b9b3e</anchor>
      <arglist>(const char *s, uint16_t length)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>appmessage.c</name>
    <path>src/c/pebble/io/appmessage/</path>
    <filename>appmessage_8c.html</filename>
    <includes id="appmessage_8h" name="appmessage.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage.h</includes>
    <includes id="appmessage__features_8h" name="appmessage_features.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage_features.h</includes>
    <includes id="callback__list_8h" name="callback_list.h" local="yes" import="no" module="no" objc="no">io/callback_list.h</includes>
    <includes id="outbox__queue_8h" name="outbox_queue.h" local="yes" import="no" module="no" objc="no">io/outbox_queue.h</includes>
    <includes id="tuple__read_8h" name="tuple_read.h" local="yes" import="no" module="no" objc="no">io/tuple_read.h</includes>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <includes id="wire__caps_8g_8h" name="wire_caps.g.h" local="yes" import="no" module="no" objc="no">wire/wire_caps.g.h</includes>
    <class kind="struct">[struct].s_handlers</class>
    <member kind="define">
      <type>#define</type>
      <name>INBOX_COMPLETE_MAX</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>ac83cbad686c149f4be2c8eeac589ca97</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>REQUEST_RETRY_MAX</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a74e58c793ca8409dc757bf0059fff54d</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>REQUEST_RETRY_DELAY_MS</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>aa5fb091797fee70e44b207aad9233dd7</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga8760e9417f2f894915a0950dc1fdab07</anchor>
      <arglist>(WeatherHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_coords</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga7c64814ef2b8dcd4ee38743e31fb58d2</anchor>
      <arglist>(CoordsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_settings_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gad9d1d40d059728d240df1d07fd713323</anchor>
      <arglist>(SettingsChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_unit_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab58b5b73b9f4c46fa2b249e2378b71b3</anchor>
      <arglist>(UnitChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_stock_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga45a5f177aabba862b779b38b5b4ed288</anchor>
      <arglist>(StockStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_calendar_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga1ab2899a032be1fe4ab307e70f8bf3cd</anchor>
      <arglist>(CalendarStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_custom_colors</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gacd479537bb794bc2cc1f07b4db3fb830</anchor>
      <arglist>(CustomColorsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_set_custom_colors_provider</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf7a398e20625029f2e376405e9132660</anchor>
      <arglist>(CustomColorsProvider cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_add_inbox_complete</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga502ebf1b6d9c87b77f5f708cd7424f86</anchor>
      <arglist>(InboxCompleteHandler cb)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>pump</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a5f7778c42828f5ddb907706658b382e8</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint32_t</type>
      <name>settings_reply_size</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>abb7f7e97f2dd93df0449b3f9bdc9c96a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>write_settings</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>afd8b8f5d619f4689a2891358d52737cc</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>kind_has_key</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>ab81a6739f4c1e01e98a42af4a9a83b96</anchor>
      <arglist>(OutboxKind kind)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>send_job</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a8227736a721829bfecf2b2649e296d98</anchor>
      <arglist>(OutboxKind kind)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>enqueue</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a4d5c99898dbd4b6c81ee21ab84e99965</anchor>
      <arglist>(OutboxKind kind, int retries)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>retry_pass</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>aa69231abc10b6f39ee8277edc53f1e11</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf552756e4da1e1818775bb984bdd36c0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_stock</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac7dbcd76bf92e5bbf684d2c9849b5ebf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_calendar</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac18380f0c5fdc613452b569ef4d88c35</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>send_settings</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a7537892c98316590da6b643bbbba37cc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>inbox_received_callback</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a0d534305af0a10edbc3c427bae3e975c</anchor>
      <arglist>(DictionaryIterator *iterator, void *context)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>inbox_dropped_callback</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a84466f8e93f6160cfe1de858608d07ce</anchor>
      <arglist>(AppMessageResult reason, void *context)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_failed_callback</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a6b185c8da29188c8cae40cdca98e100b</anchor>
      <arglist>(DictionaryIterator *iter, AppMessageResult reason, void *context)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_sent_callback</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a0369d40d54958ca96f392694cf507399</anchor>
      <arglist>(DictionaryIterator *iter, void *context)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_open</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab954f122b1dd5b44dfd5bda314c53831</anchor>
      <arglist>(uint32_t inbox_size)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @316142136073041314103207360313160174370277271221</type>
      <name>s_handlers</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>af3ad3bd6e692d8ce103607ad70171a46</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static CallbackListFn</type>
      <name>s_inbox_complete_entries</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a69c5d4c123fa7eb457ceaddd0a25358c</anchor>
      <arglist>[INBOX_COMPLETE_MAX]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static CallbackList</type>
      <name>s_inbox_complete</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a45764b077cf30a455153937be9f4684b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static OutboxQueue</type>
      <name>s_outbox</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a1a96284017193cf901d1b43de9d74204</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static AppTimer *</type>
      <name>s_retry_timer</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a1c284c34e48865d6cc11ec3e4f893a1e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_outbox_size</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a7c4c02490661b71985034c11410d24fa</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>REQUEST_RETRY_MAX</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>a74e58c793ca8409dc757bf0059fff54d</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>REQUEST_RETRY_DELAY_MS</name>
      <anchorfile>appmessage_8c.html</anchorfile>
      <anchor>aa5fb091797fee70e44b207aad9233dd7</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>appmessage.h</name>
    <path>src/c/pebble/io/appmessage/</path>
    <filename>appmessage_8h.html</filename>
    <includes id="weather__reading_8h" name="weather_reading.h" local="yes" import="no" module="no" objc="no">weather/weather_reading.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>APPMESSAGE_CUSTOM_COLORS_MAX</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga8bfcc8d396856901aeea684974fdb15c</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>WeatherHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga5e383acfcc7c48eb2dd8caac176bf5cb</anchor>
      <arglist>(const WeatherMessage *msg)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CoordsHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga59b6055d84a446d8b469ba7ef8883030</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>SettingsChangedHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaa75e1339172964d75887a1c2b7b464fe</anchor>
      <arglist>(bool time_or_date_changed)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>UnitChangedHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6fb408316f6f72341bf67751cdbd36d9</anchor>
      <arglist>(bool fahrenheit)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>StockStripHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaad5cc31baad613ac137e95653cdab162</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CalendarStripHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaea56a19672a4978e838e9d0a8753405b</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CustomColorsHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6daf051587a0083e33af5e4d0847f931</anchor>
      <arglist>(const char *combined)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CustomColorsProvider</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6efc27e8b660e10498f1678ddecc05dc</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>InboxCompleteHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaae586b1981cefa58e0284ec05e167205</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga8760e9417f2f894915a0950dc1fdab07</anchor>
      <arglist>(WeatherHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_coords</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga7c64814ef2b8dcd4ee38743e31fb58d2</anchor>
      <arglist>(CoordsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_settings_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gad9d1d40d059728d240df1d07fd713323</anchor>
      <arglist>(SettingsChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_unit_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab58b5b73b9f4c46fa2b249e2378b71b3</anchor>
      <arglist>(UnitChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_stock_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga45a5f177aabba862b779b38b5b4ed288</anchor>
      <arglist>(StockStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_calendar_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga1ab2899a032be1fe4ab307e70f8bf3cd</anchor>
      <arglist>(CalendarStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_custom_colors</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gacd479537bb794bc2cc1f07b4db3fb830</anchor>
      <arglist>(CustomColorsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_set_custom_colors_provider</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf7a398e20625029f2e376405e9132660</anchor>
      <arglist>(CustomColorsProvider cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_add_inbox_complete</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga502ebf1b6d9c87b77f5f708cd7424f86</anchor>
      <arglist>(InboxCompleteHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_open</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab954f122b1dd5b44dfd5bda314c53831</anchor>
      <arglist>(uint32_t inbox_size)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf552756e4da1e1818775bb984bdd36c0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_stock</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac7dbcd76bf92e5bbf684d2c9849b5ebf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_calendar</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac18380f0c5fdc613452b569ef4d88c35</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>appmessage_features.h</name>
    <path>src/c/pebble/io/appmessage/</path>
    <filename>appmessage__features_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>APPMESSAGE_HAS_WEATHER</name>
      <anchorfile>appmessage__features_8h.html</anchorfile>
      <anchor>a3aba6bce2b80ffd9a7451b8e3156b002</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>APPMESSAGE_HAS_LOCATION</name>
      <anchorfile>appmessage__features_8h.html</anchorfile>
      <anchor>ac8ca4974136fb295f05597a68462a938</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>outbox_queue.h</name>
    <path>src/c/pebble/io/</path>
    <filename>outbox__queue_8h.html</filename>
    <class kind="struct">OutboxJob</class>
    <class kind="struct">OutboxQueue</class>
    <member kind="define">
      <type>#define</type>
      <name>OUTBOX_QUEUE_MAX</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gacb075235dabec7bf871cfc5698a42526</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>OutboxKind</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga247b62ae1a0fa87cef6e3e8b7f738f17</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_NONE</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a7d25a430a1d15cc7f34d60d396174dc8</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_WEATHER</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17ab990da3519ee9e75a966f64b2a9fde49</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_SETTINGS</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a761144dce82352e049fa8cf0c4817b1c</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_FRESH</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a4abf64336b0b394adc142475e4687010</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_STOCK</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a1f1d2bff0cb91b1bde99a9eef0459e14</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_CALENDAR</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a2061a1a93d2450838ff186868e6b3345</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_busy</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga2c94fc09107a6527a82ec145fd784a9d</anchor>
      <arglist>(const OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_pending</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6f6fa750435ac4704bb55298be9b7e27</anchor>
      <arglist>(const OutboxQueue *outbox, OutboxKind kind)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_push</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga219aad77cbe9215d9c3cd1aacd33a457</anchor>
      <arglist>(OutboxQueue *outbox, OutboxKind kind, int retries)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_pop_front</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaa5025f0a1f281cb9b6b3f74c2a7f7481</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_take_head</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga821df0e180a04bb345ca338f3d6829e4</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static OutboxJob</type>
      <name>outbox_release</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gabf4958a2b2c2b9310e9c3dde7d76e18d</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_hold_failed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga1a93146eec16ce495449829a38274d31</anchor>
      <arglist>(OutboxQueue *outbox, OutboxJob job)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>outbox_retry_pass</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga66fb285ede9868f85fbaa10fe36ebbba</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_clear</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga7a65d4b95956b231936a0de61759fca9</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>calendar_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>calendar__store_8c.html</filename>
    <includes id="calendar__store_8h" name="calendar_store.h" local="yes" import="no" module="no" objc="no">io/stores/calendar_store.h</includes>
    <includes id="appmessage_8h" name="appmessage.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage.h</includes>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <includes id="store__fetch_8h" name="store_fetch.h" local="yes" import="no" module="no" objc="no">io/stores/store_fetch.h</includes>
    <class kind="struct">CalendarPersist</class>
    <class kind="struct">[struct].s_state</class>
    <member kind="define">
      <type>#define</type>
      <name>CALENDAR_FIRST_POLL_MS</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a73139d62bf8fca78148767c7d0c96938</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>CALENDAR_PERSIST_SLOTS</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a6e53a2809a0e3f9ee7c3f806191d7c58</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>reset_state</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a9fbef29f6a0a976770a3055c37a35d95</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>persist_save</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a7929b94f95a6b9dba4c3af1f4ee2acd2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>apply_seed</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>ac1b0e8487bbcc44a33b7c5d631d628e1</anchor>
      <arglist>(const CalendarSeed *seed)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_calendar_strip</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a1ad7346f70a3c6902ddca4acf2a83838</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cadence_poll</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>ac219f20bf18466869ec6ecc7820e97a6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga83e9c3f206ad5ced9e3d6c50cb0fa96b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad9d0b53b9a4f189dd3a591801401ec35</anchor>
      <arglist>(CalendarConfig cfg, const CalendarSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gade1a2a8d19355c64e027ed3b89479f0e</anchor>
      <arglist>(CalendarConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>const CalendarStrip *</type>
      <name>calendar_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabbe75636f8fd3bbc25e5907b8b703478</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const CalendarEvent *</type>
      <name>calendar_store_event</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3b326a92ec3b996da7b21ffe32934106</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>calendar_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga53bd3d81fba50d07ccee2739d53c22ae</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @333057173063067325370144265362001102161165156072</type>
      <name>s_state</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a5cec17681bdc44c7f6b9742712dacf24</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static StoreFetch</type>
      <name>s_fetch</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>af962c600172c1bf7e33a007776cba2ab</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_persist_key</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>afc1e32c72630b62007536cb95f77bb07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_saved_sum</name>
      <anchorfile>calendar__store_8c.html</anchorfile>
      <anchor>afd6bfed4583dc043e4cb212594733f97</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>calendar_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>calendar__store_8h.html</filename>
    <includes id="calendar__wire_8h" name="calendar_wire.h" local="yes" import="no" module="no" objc="no">wire/calendar_wire.h</includes>
    <class kind="struct">CalendarConfig</class>
    <class kind="struct">CalendarSeed</class>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad9d0b53b9a4f189dd3a591801401ec35</anchor>
      <arglist>(CalendarConfig cfg, const CalendarSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gade1a2a8d19355c64e027ed3b89479f0e</anchor>
      <arglist>(CalendarConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga83e9c3f206ad5ced9e3d6c50cb0fa96b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const CalendarStrip *</type>
      <name>calendar_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabbe75636f8fd3bbc25e5907b8b703478</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const CalendarEvent *</type>
      <name>calendar_store_event</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3b326a92ec3b996da7b21ffe32934106</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>calendar_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga53bd3d81fba50d07ccee2739d53c22ae</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>health_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>health__store_8c.html</filename>
    <includes id="health__store_8h" name="health_store.h" local="yes" import="no" module="no" objc="no">io/stores/health_store.h</includes>
    <includes id="scale_8h" name="scale.h" local="yes" import="no" module="no" objc="no">math/scale.h</includes>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <includes id="minute__window_8h" name="minute_window.h" local="yes" import="no" module="no" objc="no">health/minute_window.h</includes>
    <includes id="step__hours_8h" name="step_hours.h" local="yes" import="no" module="no" objc="no">health/step_hours.h</includes>
    <class kind="struct">HealthSaved</class>
    <class kind="struct">[struct].s_state</class>
    <member kind="define">
      <type>#define</type>
      <name>HR_HISTORY_MINUTES</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a565e5d788d520b3a16db7c546e9ee7b3</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STEP_CATCHUP_HOURS</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ae8aeac449ddb0996fbb979993bc46de9</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>metric_available</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a8edd24692a36fc2f549a011218dbc45c</anchor>
      <arglist>(HealthMetric metric, time_t start, time_t end)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>read_hr</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>aa5e9651b7557a0bdec77456faa7b73be</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>read_sum_today</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a78f21309c4be5fcdb65ba548b2024d0c</anchor>
      <arglist>(HealthMetric metric, int fallback)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static HealthMinuteData *</type>
      <name>scratch_take</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ae01790c8e757012f0597ca4d625fb387</anchor>
      <arglist>(int records)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>read_hr_history</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ae75b734a66f178f0637203c5db0fecf1</anchor>
      <arglist>(time_t now_min)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static time_t</type>
      <name>hour_start</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ad1ca88dd2fcfe3e52bc1a2d1589ab3e7</anchor>
      <arglist>(const struct tm *today, int hour)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>read_step_hourly</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ac5d29c457db49f5400731bc15fcb9c32</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>persist_save</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a7929b94f95a6b9dba4c3af1f4ee2acd2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>hr_history_advance</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>abec475d019d9d8e7a8f2b899624e41bb</anchor>
      <arglist>(time_t now_min)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>refresh_hr</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a621aad019cd81f1ec9165baaf42524c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>refresh_activity</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ad11a87cd6fe81b62297e02012fd47e6d</anchor>
      <arglist>(bool force)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>steps_first_read</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a005cb76793b70941963f6480b8a38e8c</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>notify_if_moved</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a1cf17fd9b8be04e83da4326f31779975</anchor>
      <arglist>(uint32_t before)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_health_event</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a9db8db45c6d49c4ea12cd407be92143c</anchor>
      <arglist>(HealthEventType event, void *context)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cadence_poll</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ac219f20bf18466869ec6ecc7820e97a6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>health_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3d23a155e70dad9fd2ac23f2ec39775c</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>health_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadb98993f8a5d2ea3ac0b99effab8b393</anchor>
      <arglist>(HealthConfig cfg, const HealthSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t *</type>
      <name>health_store_hr_history</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2db6e554fac24c95cdb2823cdb18bef0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const uint16_t *</type>
      <name>health_store_step_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga34ce959b4e7f9802230c7e1319b3bf28</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_step_hours</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7f6eb32c1ad9a2a9ffa41d13dc507204</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_hr</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaebe919776f17167171641aeae6310796</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_steps</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga38cd6bed400162ebab1a2284484c4445</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_calories</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabe7efc42c8679e55ecb7804fb17895ec</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_sleep_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaae218db51d5633570091919ba1e07ab4</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_active_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga1712c5d7441e81d5b804d19e112bdb3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_distance_m</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga82d8e5fff446bf3a7e20228c8cb49df9</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @341244052024166035161306331212041200054146255225</type>
      <name>s_state</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a864af5e865991c4e111dc08d165206ea</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_live</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a86591675781beec649ac9e8db3485c4f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_steps_pending</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>ae18e4c4a49e72e6e74a3ca38a0c4f0a6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_persist_key</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>afc1e32c72630b62007536cb95f77bb07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_hr_history</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a0570e28604a87591fea07b1d00bea341</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_step_history</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a020edc6544e87babbf91c8698f05fe05</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_sleep</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a60233dc911b0cddbb4943118bdcd6a49</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_active</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a95c0d4852541c54e2e54f73d03906258</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_calories</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a1298cf249bbdfafe80e35ecbf562df8f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_distance</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a09c973a046d205986bf3f25f8cdf198e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static time_t</type>
      <name>s_cached_day</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>aded462fa2005d5b78ddcc2ec22a3c224</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static int</type>
      <name>s_settled_hours</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a368b1a1c575f22bb1bcd8da8f13d0523</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_hr_history</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a0570e28604a87591fea07b1d00bea341</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_step_history</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a020edc6544e87babbf91c8698f05fe05</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_sleep</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a60233dc911b0cddbb4943118bdcd6a49</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_active</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a95c0d4852541c54e2e54f73d03906258</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_calories</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a1298cf249bbdfafe80e35ecbf562df8f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_distance</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a09c973a046d205986bf3f25f8cdf198e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static time_t</type>
      <name>s_cached_day</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>aded462fa2005d5b78ddcc2ec22a3c224</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static int</type>
      <name>s_settled_hours</name>
      <anchorfile>health__store_8c.html</anchorfile>
      <anchor>a368b1a1c575f22bb1bcd8da8f13d0523</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>health_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>health__store_8h.html</filename>
    <class kind="struct">HealthConfig</class>
    <class kind="struct">HealthSeed</class>
    <member kind="function">
      <type>void</type>
      <name>health_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadb98993f8a5d2ea3ac0b99effab8b393</anchor>
      <arglist>(HealthConfig cfg, const HealthSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>health_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3d23a155e70dad9fd2ac23f2ec39775c</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>uint8_t *</type>
      <name>health_store_hr_history</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2db6e554fac24c95cdb2823cdb18bef0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const uint16_t *</type>
      <name>health_store_step_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga34ce959b4e7f9802230c7e1319b3bf28</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_step_hours</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7f6eb32c1ad9a2a9ffa41d13dc507204</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_hr</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaebe919776f17167171641aeae6310796</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_steps</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga38cd6bed400162ebab1a2284484c4445</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_calories</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabe7efc42c8679e55ecb7804fb17895ec</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_sleep_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaae218db51d5633570091919ba1e07ab4</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_active_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga1712c5d7441e81d5b804d19e112bdb3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_distance_m</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga82d8e5fff446bf3a7e20228c8cb49df9</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>location_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>location__store_8c.html</filename>
    <includes id="location__store_8h" name="location_store.h" local="yes" import="no" module="no" objc="no">io/stores/location_store.h</includes>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <includes id="appmessage_8h" name="appmessage.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage.h</includes>
    <includes id="coords_8h" name="coords.h" local="yes" import="no" module="no" objc="no">wire/coords.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <class kind="struct">[struct].s_state</class>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>persist_save</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>a7929b94f95a6b9dba4c3af1f4ee2acd2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>set</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>ae105e0a25cad9f394204c3eebad894f5</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>location_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga59425f07e9de612bbcaae2dd0bcf266f</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>location_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2027df7324b501eba2a93b048974f50c</anchor>
      <arglist>(LocationConfig cfg, const LocationSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lat</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaca52fe40f16b8699445cc2a3d3df0bf9</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lon</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga84432464d20d131431730d966053fc52</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_persist_key</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>afc1e32c72630b62007536cb95f77bb07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @071205373035162224161047017043173162266213116111</type>
      <name>s_state</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>ae7f03baf77e513f445e5b03585e4987e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_saved_sum</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>afd6bfed4583dc043e4cb212594733f97</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_live</name>
      <anchorfile>location__store_8c.html</anchorfile>
      <anchor>a86591675781beec649ac9e8db3485c4f</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>location_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>location__store_8h.html</filename>
    <class kind="struct">LocationConfig</class>
    <class kind="struct">LocationSeed</class>
    <member kind="function">
      <type>void</type>
      <name>location_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2027df7324b501eba2a93b048974f50c</anchor>
      <arglist>(LocationConfig cfg, const LocationSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>location_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga59425f07e9de612bbcaae2dd0bcf266f</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lat</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaca52fe40f16b8699445cc2a3d3df0bf9</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lon</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga84432464d20d131431730d966053fc52</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>stock_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>stock__store_8c.html</filename>
    <includes id="stock__store_8h" name="stock_store.h" local="yes" import="no" module="no" objc="no">io/stores/stock_store.h</includes>
    <includes id="appmessage_8h" name="appmessage.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage.h</includes>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <includes id="store__fetch_8h" name="store_fetch.h" local="yes" import="no" module="no" objc="no">io/stores/store_fetch.h</includes>
    <class kind="struct">[struct].s_state</class>
    <member kind="define">
      <type>#define</type>
      <name>STOCK_FIRST_POLL_MS</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>add7b6eb41b69d99664bcf9d324a8019d</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>reset_state</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>a9fbef29f6a0a976770a3055c37a35d95</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>persist_save</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>a7929b94f95a6b9dba4c3af1f4ee2acd2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>apply_seed</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>a0dc7c52be58d63c4224ad00a7f2b5e5d</anchor>
      <arglist>(const StockSeed *seed)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_stock_strip</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>a611ee6200dc6d16566d4f9039f03ded9</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cadence_poll</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>ac219f20bf18466869ec6ecc7820e97a6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga286d1850c71a9b7e3e62be5b92ea916a</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0631f8c075d9a6c76e2f6f386f3970</anchor>
      <arglist>(StockConfig cfg, const StockSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf5880da69fee6e18843b989032e67836</anchor>
      <arglist>(StockConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>const StockStrip *</type>
      <name>stock_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4b56f050715401cfdd8a57bd1063cbe7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const StockSlot *</type>
      <name>stock_store_slot</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga44242789115b6e0615358ddc114a24dc</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>stock_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5074e747148193546c869652ea01584d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @312127331127251366210315313134246166131107211324</type>
      <name>s_state</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>ae885cb7823f20f0776a27f98b68935b2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static StoreFetch</type>
      <name>s_fetch</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>af962c600172c1bf7e33a007776cba2ab</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_persist_key</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>afc1e32c72630b62007536cb95f77bb07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_saved_sum</name>
      <anchorfile>stock__store_8c.html</anchorfile>
      <anchor>afd6bfed4583dc043e4cb212594733f97</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>stock_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>stock__store_8h.html</filename>
    <includes id="stock__wire_8h" name="stock_wire.h" local="yes" import="no" module="no" objc="no">wire/stock_wire.h</includes>
    <class kind="struct">StockConfig</class>
    <class kind="struct">StockSeed</class>
    <member kind="function">
      <type>void</type>
      <name>stock_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0631f8c075d9a6c76e2f6f386f3970</anchor>
      <arglist>(StockConfig cfg, const StockSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf5880da69fee6e18843b989032e67836</anchor>
      <arglist>(StockConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga286d1850c71a9b7e3e62be5b92ea916a</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const StockStrip *</type>
      <name>stock_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4b56f050715401cfdd8a57bd1063cbe7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const StockSlot *</type>
      <name>stock_store_slot</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga44242789115b6e0615358ddc114a24dc</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>stock_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5074e747148193546c869652ea01584d</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_cadence.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__cadence_8c.html</filename>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="callback__list_8h" name="callback_list.h" local="yes" import="no" module="no" objc="no">io/callback_list.h</includes>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_register</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc0f8176e42cbe69fd30b1a363ca4794</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga10c78a131269bea0afd102549a41083c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static CallbackListFn</type>
      <name>s_entries</name>
      <anchorfile>store__cadence_8c.html</anchorfile>
      <anchor>a12aea18762db9ee08cbf3a1741e2b9a7</anchor>
      <arglist>[STORE_CADENCE_MAX]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static CallbackList</type>
      <name>s_list</name>
      <anchorfile>store__cadence_8c.html</anchorfile>
      <anchor>a34430e955454940bcf64454c4c01dfc4</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_cadence.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__cadence_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>STORE_CADENCE_MAX</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga60f6d598b8ff59f299aa4ded2e48b695</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_register</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc0f8176e42cbe69fd30b1a363ca4794</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga10c78a131269bea0afd102549a41083c</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_fetch.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__fetch_8c.html</filename>
    <includes id="store__fetch_8h" name="store_fetch.h" local="yes" import="no" module="no" objc="no">io/stores/store_fetch.h</includes>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5f892bf9d70a4f44dbdd186ce95eaf12</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_stop</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga01742f5fe91b9b4c089f9540e5c6a10f</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_arm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad33c4412c02b7068286958a4ff9d39c0</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gae24dbc83a69a2c585fc08c07f2d27091</anchor>
      <arglist>(StoreFetch *fetch, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_start</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gab0e39f35c438d27685e759973a271790</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3baeb7249495a37edb88ef463ba8d904</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_fetch.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__fetch_8h.html</filename>
    <includes id="store__poll_8h" name="store_poll.h" local="yes" import="no" module="no" objc="no">io/stores/store_poll.h</includes>
    <class kind="struct">StoreFetch</class>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5f892bf9d70a4f44dbdd186ce95eaf12</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_stop</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga01742f5fe91b9b4c089f9540e5c6a10f</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_arm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad33c4412c02b7068286958a4ff9d39c0</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gae24dbc83a69a2c585fc08c07f2d27091</anchor>
      <arglist>(StoreFetch *fetch, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_start</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gab0e39f35c438d27685e759973a271790</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3baeb7249495a37edb88ef463ba8d904</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_persist.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__persist_8c.html</filename>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>store_save_changed</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga26072e6c901d3d7455c93261276e6922</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_restore_reading</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gacfb278bcfc9c6dbc28c5728a3b68e277</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_persist.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__persist_8h.html</filename>
    <includes id="store__sum_8h" name="store_sum.h" local="yes" import="no" module="no" objc="no">io/stores/store_sum.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_WEATHER</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf7f92da5799b3fc95c172f84287e6867</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_STOCK</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5b35a6941ad6bb200a944b38ae9fa676</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_CALENDAR</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga71057ac435b7b29a882b011053659d86</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_HEALTH</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga31737569cb65fc760932f244727a568d</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_LOCATION</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa19bf75ee3cb87a3a31a97238f4dcf73</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_restore</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga286178630dd827b7d2e677742541e280</anchor>
      <arglist>(uint32_t key, void *state, size_t size, uint8_t tag)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_save</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga814b2c13673684e3684ff4ed7beec6eb</anchor>
      <arglist>(uint32_t key, void *state, size_t size, uint8_t tag)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_save_changed</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga26072e6c901d3d7455c93261276e6922</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_restore_reading</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gacfb278bcfc9c6dbc28c5728a3b68e277</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_WEATHER</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf7f92da5799b3fc95c172f84287e6867</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_STOCK</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5b35a6941ad6bb200a944b38ae9fa676</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_CALENDAR</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga71057ac435b7b29a882b011053659d86</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_HEALTH</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga31737569cb65fc760932f244727a568d</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_LOCATION</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa19bf75ee3cb87a3a31a97238f4dcf73</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_poll.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__poll_8c.html</filename>
    <includes id="store__poll_8h" name="store_poll.h" local="yes" import="no" module="no" objc="no">io/stores/store_poll.h</includes>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_set</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga30b8b33c3204c012230afe0eb9e8d594</anchor>
      <arglist>(StorePoll *poll, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga576c21d8f643934d22918c3fb2cbeeef</anchor>
      <arglist>(StorePoll *poll, time_t now)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_poll.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__poll_8h.html</filename>
    <class kind="struct">StorePoll</class>
    <member kind="function" static="yes">
      <type>static time_t</type>
      <name>store_poll_next</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaee79556bd3009dd1478b61913e5368d4</anchor>
      <arglist>(int poll_min, time_t now)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_poll_due</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga997e6ccf70b96c79e2500b83af6e54dc</anchor>
      <arglist>(int poll_min, time_t *next, time_t now)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_poll_reconnect_due</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga8bf76bddf8844add6cd6e7c0684b8ee0</anchor>
      <arglist>(int age_s, int poll_min)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_set</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga30b8b33c3204c012230afe0eb9e8d594</anchor>
      <arglist>(StorePoll *poll, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga576c21d8f643934d22918c3fb2cbeeef</anchor>
      <arglist>(StorePoll *poll, time_t now)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_sum.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__sum_8c.html</filename>
    <includes id="store__sum_8h" name="store_sum.h" local="yes" import="no" module="no" objc="no">io/stores/store_sum.h</includes>
    <member kind="function">
      <type>uint32_t</type>
      <name>store_sum</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga51f7004ec5d8471cdf108a9ee46bb77b</anchor>
      <arglist>(const void *bytes, size_t size)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>store_sum.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>store__sum_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>STORE_READING_SIZE</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga50fd63663c9be7ae50341d6862e04150</anchor>
      <arglist>(state, stamp)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>store_sum</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga51f7004ec5d8471cdf108a9ee46bb77b</anchor>
      <arglist>(const void *bytes, size_t size)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>system_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>system__store_8c.html</filename>
    <includes id="system__store_8h" name="system_store.h" local="yes" import="no" module="no" objc="no">io/stores/system_store.h</includes>
    <class kind="struct">[struct].s_state</class>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>set_battery</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a15cd2f3047048f896198aad66974e8b5</anchor>
      <arglist>(int level, bool charging)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>set_bluetooth</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a0e2565513a6aae0c0c79e2b69154d35c</anchor>
      <arglist>(bool connected)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_battery</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>acd10b3aaddfe22573b8e9d242eff655b</anchor>
      <arglist>(BatteryChargeState state)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_connection</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>af2f59572470146f43e36b0480130d05b</anchor>
      <arglist>(bool connected)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa56e12f48eddf86b1533059128765d2e</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_on_reconnect</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa29b6900ac64eda8dfb6dd8918ef531b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga98c417e24d8488baa2bb33e39155a3e7</anchor>
      <arglist>(SystemConfig cfg, const SystemSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_deinit</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga8d12e20cd8e402fc7c7abbfcd7454f3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>system_store_battery</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0a7b3e80e633a5f021929a1f3751260f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_charging</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga93e1005fb36a193016d69e406ef58f16</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_bluetooth</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2ebbd6eb46dfd92742b55a346d164961</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_next_alarm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga323c6c5d1989296b9618d94e94f92daa</anchor>
      <arglist>(time_t *out)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct @362235322165356266257300263126207006223155011222</type>
      <name>s_state</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a6ecec114912b30fcb280cd55636369b6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_bt_initialized</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a79e1d87e0fc4fcc34ecaab711a8c9b20</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_live</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a86591675781beec649ac9e8db3485c4f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static time_t</type>
      <name>s_seed_alarm</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a6c3d05d77814566ebfe0ec462c67324d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static BtVibePolicy</type>
      <name>s_vibe</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>a31b5ed7b8b45ba3b1d0ae0689ab31747</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_reconnect</name>
      <anchorfile>system__store_8c.html</anchorfile>
      <anchor>aa5f439ff5804491818cbb8d665f2b0f4</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>system_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>system__store_8h.html</filename>
    <class kind="struct">SystemConfig</class>
    <class kind="struct">SystemSeed</class>
    <member kind="typedef">
      <type>void(*)</type>
      <name>BtVibePolicy</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga96c4cb6d425115a65f787896786b232f</anchor>
      <arglist>(bool connected)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga98c417e24d8488baa2bb33e39155a3e7</anchor>
      <arglist>(SystemConfig cfg, const SystemSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_deinit</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga8d12e20cd8e402fc7c7abbfcd7454f3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa56e12f48eddf86b1533059128765d2e</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_on_reconnect</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa29b6900ac64eda8dfb6dd8918ef531b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>system_store_battery</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0a7b3e80e633a5f021929a1f3751260f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_charging</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga93e1005fb36a193016d69e406ef58f16</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_bluetooth</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2ebbd6eb46dfd92742b55a346d164961</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_next_alarm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga323c6c5d1989296b9618d94e94f92daa</anchor>
      <arglist>(time_t *out)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>time_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>time__store_8c.html</filename>
    <includes id="time__store_8h" name="time_store.h" local="yes" import="no" module="no" objc="no">io/stores/time_store.h</includes>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="units_8h" name="units.h" local="yes" import="no" module="no" objc="no">system/units/units.h</includes>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>tick_handler</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a693304ffdfb2fb3a8f990f8f6bab9f45</anchor>
      <arglist>(struct tm *tick_time, TimeUnits units_changed)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>set</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>af5ca081d291a55bf66553c888a21abf4</anchor>
      <arglist>(const struct tm *t)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>beats_fire</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a760d605d56d3d2830e7356ad248400b2</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>start_ticker</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>ab8e8312ec2a60fbeb416d80c0858872f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>stop_ticker</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a598578fd5c48946f7fd5962c92b526b5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga03d7e9b1823247fa9d5a6ead85797571</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga000282fef3aa31a69a8038abb49fa576</anchor>
      <arglist>(TimeConfig cfg, const struct tm *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9c2eacc43d552852d63185bd4ca16379</anchor>
      <arglist>(TimeConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>const struct tm *</type>
      <name>time_store_tm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc9650a7506ac75294df48a7a8deadcd</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static struct tm</type>
      <name>s_tm</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>ac91dab61b991b18d0b6f0632cb71a458</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static AppTimer *</type>
      <name>s_beats_timer</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a25cfc5c232d6d20427553ac3cd954060</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_minute</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a8d97f148044f6486b6f7880444989530</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_beats</name>
      <anchorfile>time__store_8c.html</anchorfile>
      <anchor>a3d9299acd4b3e475b07567a74035c95c</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>time_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>time__store_8h.html</filename>
    <class kind="struct">TimeConfig</class>
    <member kind="function">
      <type>void</type>
      <name>time_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga000282fef3aa31a69a8038abb49fa576</anchor>
      <arglist>(TimeConfig cfg, const struct tm *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9c2eacc43d552852d63185bd4ca16379</anchor>
      <arglist>(TimeConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga03d7e9b1823247fa9d5a6ead85797571</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const struct tm *</type>
      <name>time_store_tm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc9650a7506ac75294df48a7a8deadcd</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_store.c</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>weather__store_8c.html</filename>
    <includes id="weather__store_8h" name="weather_store.h" local="yes" import="no" module="no" objc="no">io/stores/weather_store.h</includes>
    <includes id="appmessage_8h" name="appmessage.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage.h</includes>
    <includes id="store__cadence_8h" name="store_cadence.h" local="yes" import="no" module="no" objc="no">io/stores/store_cadence.h</includes>
    <includes id="store__persist_8h" name="store_persist.h" local="yes" import="no" module="no" objc="no">io/stores/store_persist.h</includes>
    <includes id="store__fetch_8h" name="store_fetch.h" local="yes" import="no" module="no" objc="no">io/stores/store_fetch.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <includes id="forecast__age_8h" name="forecast_age.h" local="yes" import="no" module="no" objc="no">weather/forecast_age.h</includes>
    <includes id="weather__reading_8h" name="weather_reading.h" local="yes" import="no" module="no" objc="no">weather/weather_reading.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_FIRST_POLL_MS</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a095baca2ac96275e14cbde3495f43b73</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_BOOT_RETRY_MS</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>aff467cb3eccd97fac6e8e0eb3dfb4ba7</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_BOOT_RETRIES</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a3e000c92d82e89bbcb703377923e50fa</anchor>
      <arglist></arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>reset_state</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a9fbef29f6a0a976770a3055c37a35d95</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>mark_dirty</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a38798b6392bd528fd20169e49b63ff36</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>persist_flush</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a91a226520846cd505005169ca4f9d754</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>inbox_done</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a9733ae28f8c21e9ec18ae4251141d96b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>apply_seed</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>aa5bb619dd308587c2ec6444250ee6ab1</anchor>
      <arglist>(const WeatherSeed *seed)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_weather</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>af5f33238881e8b25ccd2445b79ccb95a</anchor>
      <arglist>(const WeatherMessage *msg)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>on_unit_changed</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>ab270d4f87c98123387d5599b915429b3</anchor>
      <arglist>(bool fahrenheit)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>boot_fire</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a57f5cd13bc80a504451172b29ed6e7de</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cadence_poll</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>ac219f20bf18466869ec6ecc7820e97a6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga40fd78d1cab03532c37b131b1c2a9111</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga49a92d34f22c2bb81f54084b02215709</anchor>
      <arglist>(WeatherConfig cfg, const WeatherSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2af1e0b42fd91db04b7bf0e358f80a85</anchor>
      <arglist>(WeatherConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2cd48126740a404ee6893890c5abf288</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>forecast_today</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a6338097c3aa566509557080e498f23a1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2b52199ca0e311c968b7f831305acd62</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond_label</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad57eba8aa9a6f59644fedafcac7a3bab</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_humidity</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0de378ffe3adbadab18b877c3e214c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_wind_kmh</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06fe793fd4c59b655856f6f1454e66a1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_wind_dir</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga21865e60abf090e923d95f74e4e5e3b2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunrise</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadcce3fc2dbdf6a3ccd751a70ef171adf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunset</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga613a6718a67c620b3c4623cbbfc3d84e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_uv</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga839bf5c5187f067697de69f79f025b3f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_max</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9521fad2bb38f644e02c9c3ac8547d4b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3ad694d30ad387bd9a9c1db451cc9c2d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_precip_chance</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga04d4ed2abc57cd51459c6913b2d77e1d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_feels_like</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06cf30734c71d28b90e5b660ee75bc9d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_pressure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gac167df267d9204941ae5ef9541074edc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_dew_point</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4780ec893b0d2cb94e17ab85c78e377d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherHourly *</type>
      <name>weather_store_forecast_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaba5bc2a406811b7f6d4b6df181f620d7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherDaily *</type>
      <name>weather_store_forecast_daily</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0610dff5f72df6fa9f4312a73e6d96de</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7856768b2bde2cf55422b2c3b5ea3b4e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static WeatherState</type>
      <name>s_state</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a2a3db4bc36fd168193b20a09c608c773</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_cb</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a0d75601f9ac1a6725c17065d338a664a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static int</type>
      <name>s_boot_retries</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a3e8ceb6edd19c82d11e2d15c671924f4</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static StoreFetch</type>
      <name>s_fetch</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>af962c600172c1bf7e33a007776cba2ab</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_persist_key</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>afc1e32c72630b62007536cb95f77bb07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_dirty</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>ae8a3c3beea14ff8ceadf605953c6ee61</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_changed</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a2e6dcdd2124edeff7e300cf6de89bcda</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_heard</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a4cf02b128b4097de9a6c85cd0ded8adc</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_saved_sum</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>afd6bfed4583dc043e4cb212594733f97</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_BOOT_RETRY_MS</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>aff467cb3eccd97fac6e8e0eb3dfb4ba7</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_BOOT_RETRIES</name>
      <anchorfile>weather__store_8c.html</anchorfile>
      <anchor>a3e000c92d82e89bbcb703377923e50fa</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>weather_store.h</name>
    <path>src/c/pebble/io/stores/</path>
    <filename>weather__store_8h.html</filename>
    <includes id="weather__wire_8h" name="weather_wire.h" local="yes" import="no" module="no" objc="no">wire/weather_wire.h</includes>
    <class kind="struct">WeatherConfig</class>
    <class kind="struct">WeatherSeed</class>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_SEED_EMPTY</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gae0d84f2727ec304e5376009e5f7dcd18</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga49a92d34f22c2bb81f54084b02215709</anchor>
      <arglist>(WeatherConfig cfg, const WeatherSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2af1e0b42fd91db04b7bf0e358f80a85</anchor>
      <arglist>(WeatherConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga40fd78d1cab03532c37b131b1c2a9111</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2cd48126740a404ee6893890c5abf288</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2b52199ca0e311c968b7f831305acd62</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond_label</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad57eba8aa9a6f59644fedafcac7a3bab</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_humidity</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0de378ffe3adbadab18b877c3e214c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_wind_kmh</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06fe793fd4c59b655856f6f1454e66a1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_wind_dir</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga21865e60abf090e923d95f74e4e5e3b2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunrise</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadcce3fc2dbdf6a3ccd751a70ef171adf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunset</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga613a6718a67c620b3c4623cbbfc3d84e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_feels_like</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06cf30734c71d28b90e5b660ee75bc9d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_pressure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gac167df267d9204941ae5ef9541074edc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_dew_point</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4780ec893b0d2cb94e17ab85c78e377d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_uv</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga839bf5c5187f067697de69f79f025b3f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_max</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9521fad2bb38f644e02c9c3ac8547d4b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3ad694d30ad387bd9a9c1db451cc9c2d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_precip_chance</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga04d4ed2abc57cd51459c6913b2d77e1d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherHourly *</type>
      <name>weather_store_forecast_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaba5bc2a406811b7f6d4b6df181f620d7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherDaily *</type>
      <name>weather_store_forecast_daily</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0610dff5f72df6fa9f4312a73e6d96de</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7856768b2bde2cf55422b2c3b5ea3b4e</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>tuple_read.c</name>
    <path>src/c/pebble/io/</path>
    <filename>tuple__read_8c.html</filename>
    <includes id="tuple__read_8h" name="tuple_read.h" local="yes" import="no" module="no" objc="no">io/tuple_read.h</includes>
    <includes id="wire__read_8h" name="wire_read.h" local="yes" import="no" module="no" objc="no">wire/wire_read.h</includes>
    <member kind="function">
      <type>int32_t</type>
      <name>tuple_int_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga2efbc3a4f1c2f061db644fae33148a15</anchor>
      <arglist>(const Tuple *tuple, int32_t fallback)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>tuple_str_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga86dd1adef099205e5eb8c1d52b03ce96</anchor>
      <arglist>(const Tuple *tuple, const char *fallback)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>tuple_read.h</name>
    <path>src/c/pebble/io/</path>
    <filename>tuple__read_8h.html</filename>
    <member kind="function">
      <type>int32_t</type>
      <name>tuple_int_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga2efbc3a4f1c2f061db644fae33148a15</anchor>
      <arglist>(const Tuple *tuple, int32_t fallback)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>tuple_str_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga86dd1adef099205e5eb8c1d52b03ce96</anchor>
      <arglist>(const Tuple *tuple, const char *fallback)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>setting_values.h</name>
    <path>src/c/pebble/system/settings/</path>
    <filename>setting__values_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>TimeFormat</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga25de3b313f6a766c08b5af9f3cac864d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_SYSTEM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da63335a13eb734c3302caeeb5b9d74485</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_12H</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864daed991c52c4fa5f4569d7213de1fa7763</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_24H</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864daf1d5570fd3277ed40a3b0378cf1a2f79</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_BEATS</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da7cda0e5d3eeee8e6f82b6ae89cf120d5</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_12H_NO_LEAD</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da9522d658e373ea077be0a0edfaf58468</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da4ffd6b05b8739bfa9443b3b08aaa447f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>StepsMode</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga6e6066815d52058ba7571050020ca960</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_STEPS</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960aa29671c6c7e06670eb55a4a4f062e7fa</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_MILES</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960a062656b30d579c0240fb0328b9b95fbe</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_KM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960a5bfc8f1e5575d9f15901d28ed9a82edf</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960ab5ce5ab146d3c8bd00eeb2c933937928</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>DistanceUnit</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga4c67a7b952f3804e2bd056cf95c4161a</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_KM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aa9f93d9e27b923402d6c730122896530f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_MILES</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aae026af054f0e10b7ae1896cf47ab26f3</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aaca24a90c5e04e8f18619665261912ae9</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>VibeChoice</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga7b8aec224cacf74446d899e5eaab0819</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_NONE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819acea2b08ae811c660ece561bd9ee6075a</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_SHORT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819a81c74b9772cdf17b4c1ba152a188f052</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_LONG</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819acebdbaa12797350abb41b9484f67de79</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_DOUBLE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819ad39a0395f1a3f01c96f7ea467c9bbc26</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819a1415e32b1347a563573ba9ce377f4856</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>BatteryDisplay</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaaec2354b2ba9c2f927d81fc5daf6d24d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_BOTH</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24da5e582ca0827de8a4e8fde4b51531e8c2</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24da932a7cf8db1d4e388d04275565b50357</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_PERCENT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24dadb70a1bb92d4ea05d4d1ddf4b3f230d7</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24daa60c922484f7d2a88e9c7d42a8af9fb0</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>settings.c</name>
    <path>src/c/pebble/system/settings/</path>
    <filename>settings_8c.html</filename>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <includes id="tuple__read_8h" name="tuple_read.h" local="yes" import="no" module="no" objc="no">io/tuple_read.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <includes id="number__format_8h" name="number_format.h" local="yes" import="no" module="no" objc="no">text/number_format.h</includes>
    <member kind="function" static="yes">
      <type>static void *</type>
      <name>field_ptr</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a9c02c31794700bb68b55537aba182399</anchor>
      <arglist>(const SettingsSchema *schema, const SettingField *field)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint8_t</type>
      <name>get_version</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a50844639d64b22a4b3af0facb74ccf31</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>set_version</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>ad62598c57dd65d4124722127957f24cd</anchor>
      <arglist>(const SettingsSchema *schema, uint8_t version)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>build_index</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a06306d4021a430cb7838afe79711bc82</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint8_t</type>
      <name>color_channel</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a6a4ffb328a62269e89060788a3940157</anchor>
      <arglist>(uint32_t byte)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint8_t</type>
      <name>color_from_hex</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a4e4f02059ce1a056a7ea9757a4c6129d</anchor>
      <arglist>(uint32_t hex)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint32_t</type>
      <name>color_to_hex</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a616476f1136e572530e52bedc804b1ad</anchor>
      <arglist>(uint8_t argb)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>apply_defaults</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a8fd085e0bf9151d4771683129cb2964c</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>sanitize_cstring</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>ae0e0f648471d2d0721f39364d0fd7311</anchor>
      <arglist>(const SettingsSchema *schema, const SettingField *field)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>sanitize</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a65b158704b02954e590b5e35d81a1557</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>save_schema</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a2cf5365c5efd32d58fee43dc10e0cb09</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>load_schema</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>ade6ab9e36147a4fcf04acd1f5264a98b</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_init</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gabf78fb93dcb30f9c8f17cc2eaa9a934e</anchor>
      <arglist>(const SettingsSchema *head)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_was_fresh</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga40b5dc5d02dfa2e8a630782dc5be7263</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_save</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab9d20e3758e874e18f045827a5cd29b3</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_mark_restored</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga311ba161873a4026937acc17c57525cc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga3751b197b3c6a12637ebdf7ebc0ea997</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>settings_str</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab048a393e0f36aa1df969db0a34db046</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_set_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaca6beaa8ac8e3de5499b406ebab187af</anchor>
      <arglist>(SettingId id, uint8_t value)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_enum_count</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga7f6e82a36168e1d570748a8c18d0a30b</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>enum_text</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a895927e65d1e699baf9e552d266c02cc</anchor>
      <arglist>(uint8_t value, char *buf, size_t size)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint32_t</type>
      <name>field_value_size_max</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>af2864a2798c5e8551ec3217923c20354</anchor>
      <arglist>(const SettingField *field)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>settings_serialized_size_max</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga281a4f818f93bf883410d0222e21713b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_serialize</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8a25e0c1aea6e4cb033cefa62a590458</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
    <member kind="function">
      <type>SettingsInbound</type>
      <name>settings_apply_inbox</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga226c66180fb376a5888b279eca034417</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static const SettingsSchema *</type>
      <name>s_primary</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a103a9efc5cd332137f9d11dca75ae011</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_was_fresh</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>aa467d3462915f91a8ef7e224cba65b46</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static const SettingField *</type>
      <name>s_by_id</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>adcdaae53b13f19b99ab529c1fcf20f70</anchor>
      <arglist>[SETTING_COUNT]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static const SettingsSchema *</type>
      <name>s_owner_by_id</name>
      <anchorfile>settings_8c.html</anchorfile>
      <anchor>a8e4e35842d12414042a0ffc65b36328e</anchor>
      <arglist>[SETTING_COUNT]</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>settings.h</name>
    <path>src/c/pebble/system/settings/</path>
    <filename>settings_8h.html</filename>
    <class kind="struct">SettingField</class>
    <class kind="struct">SettingsSchema</class>
    <class kind="struct">SettingsInbound</class>
    <member kind="typedef">
      <type>struct SettingsSchema</type>
      <name>SettingsSchema</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga4c71229864f5dc765a8b70c2c971fb99</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>SettingId</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga5b6861430c47031f602e2af972953f53</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_TEMPERATURE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a1019e4e2d28c1701a2d2f31b733bb188</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_DATE_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53af80c4cb917a7de898f4024852a77cf75</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_THEME</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a71f897633057f6efea0f87bd0ffaa5a2</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_STEPS_MODE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53af493313f74aa611a4726b8beebe09ea4</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_DISTANCE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53acb4709fec470f37af97855bcffbf6e19</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_TIME_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aa11a12d9cbe1d2e83e9ebdbb799582cf</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53ac6fc547727f28528f43d6e9dafa34315</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_QUIET_TIME_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a72f06dd4e0dfaf0b724a5b3188e2c5bd</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_VIBE_CONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a4134cdbe739d3b5cfbaf90fa65312548</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_VIBE_DISCONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aa7a8c945d5c0cc9cf86a295aa468dfc0</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_HOURLY_VIBE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a1cc0cdb25c54b97706636d1b0019e895</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BATTERY_DISPLAY</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a55fd50c70be3d5855ed7ae3f9a158276</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_HEADER_FONT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aafd1da9c39c0d57c730c1aadea997fb9</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a426d509db457c0ed090c5cbe59517a33</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>SettingType</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8dfa1a122b59a38c38cc2824be723338</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BOOL</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338ae6502b94eb9c2d9511fef893f08cf3be</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_ENUM_U8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338a75134673575de8e48aec0067e543b066</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_CSTRING</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338af6eeeb0762facb761e45e86fea90b345</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_COLOR</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338a9a64de1bc8a9ea6b2eb8ad77c291fdf3</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_init</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gabf78fb93dcb30f9c8f17cc2eaa9a934e</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_was_fresh</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga40b5dc5d02dfa2e8a630782dc5be7263</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_save</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab9d20e3758e874e18f045827a5cd29b3</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_mark_restored</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga311ba161873a4026937acc17c57525cc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga3751b197b3c6a12637ebdf7ebc0ea997</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>settings_str</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab048a393e0f36aa1df969db0a34db046</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_set_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaca6beaa8ac8e3de5499b406ebab187af</anchor>
      <arglist>(SettingId id, uint8_t value)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_enum_count</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga7f6e82a36168e1d570748a8c18d0a30b</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>settings_serialized_size_max</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga281a4f818f93bf883410d0222e21713b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_serialize</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8a25e0c1aea6e4cb033cefa62a590458</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
    <member kind="function">
      <type>SettingsInbound</type>
      <name>settings_apply_inbox</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga226c66180fb376a5888b279eca034417</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>settings_catalog.h</name>
    <path>src/c/pebble/system/settings/</path>
    <filename>settings__catalog_8h.html</filename>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_TEMPERATURE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaeeceac8a6d66376b0fbb3b495e245a8c</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_DATE_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga25c13546f27ddad133d5d8cbe348d84a</anchor>
      <arglist>(off, dflt)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_THEME</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga0d7b14fdb5d548d8571799ed3b9f2325</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_STEPS_MODE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga019f574fbd717df373aa4f6a2fa623f7</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_DISTANCE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gace7412b22cb2958264322350c07c65cd</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_TIME_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga51c9800159631adbf77eafe13eeb3d34</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga5f8c5ebca9a4cae4d21ee7a6b8280fb8</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_QUIET_TIME_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga85914fbaf222c55ef9c16f52c16fceb0</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_VIBE_CONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga3b7c73968d189a076bb660a5e654471b</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_VIBE_DISCONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga1f3cdcddc8652b8560d494e04b4f4ae7</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_HOURLY_VIBE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga841203aee583d7a932bc02a1f4517847</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BATTERY_DISPLAY</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8060d99e4e1951c1e98e0e3c49e77db3</anchor>
      <arglist>(off, count)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>units.c</name>
    <path>src/c/pebble/system/units/</path>
    <filename>units_8c.html</filename>
    <includes id="units_8h" name="units.h" local="yes" import="no" module="no" objc="no">system/units/units.h</includes>
    <includes id="beats_8h" name="beats.h" local="yes" import="no" module="no" objc="no">clock/beats.h</includes>
    <includes id="distance_8h" name="distance.h" local="yes" import="no" module="no" objc="no">units/distance.h</includes>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>ms_into_bmt_day</name>
      <anchorfile>units_8c.html</anchorfile>
      <anchor>ae91f72639754ac5618e2ccafd1cff1a1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>units_swatch_beats</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6abe1f5f8efd60ddf21617822f0f6fd6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>units_ms_until_next_beat</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga85d3000cf6b4ab6360ff3df4e97add8e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga94c81ab17362b08d64e0b2497730bbd5</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance_value</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga4132ffc49e378387d53b1a1171fd2b05</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>units_distance_unit</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6c4edc61ad14869972212cf59a4f7d47</anchor>
      <arglist>(bool miles)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>units.h</name>
    <path>src/c/pebble/system/units/</path>
    <filename>units_8h.html</filename>
    <member kind="function">
      <type>int</type>
      <name>units_swatch_beats</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6abe1f5f8efd60ddf21617822f0f6fd6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>units_ms_until_next_beat</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga85d3000cf6b4ab6360ff3df4e97add8e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga94c81ab17362b08d64e0b2497730bbd5</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance_value</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga4132ffc49e378387d53b1a1171fd2b05</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>units_distance_unit</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6c4edc61ad14869972212cf59a4f7d47</anchor>
      <arglist>(bool miles)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>vibe.c</name>
    <path>src/c/pebble/system/vibe/</path>
    <filename>vibe_8c.html</filename>
    <includes id="vibe_8h" name="vibe.h" local="yes" import="no" module="no" objc="no">system/vibe/vibe.h</includes>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <includes id="setting__values_8h" name="setting_values.h" local="yes" import="no" module="no" objc="no">system/settings/setting_values.h</includes>
    <member kind="function">
      <type>void</type>
      <name>vibe_pulse</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga06fdc71bb88f3abae23d9c6ac8ef7c8e</anchor>
      <arglist>(VibePulse pulse)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_custom</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga005b71470c6beaa166cd9cc7c5cf10b1</anchor>
      <arglist>(const uint32_t *durations, uint32_t num_segments)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_choice</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga68e3aacc6c4efcb6b2827627e09da299</anchor>
      <arglist>(uint8_t choice)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_bt_transition</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga9b510de5a24f5136dfb470f5aa6aafd5</anchor>
      <arglist>(bool connected)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>vibe.h</name>
    <path>src/c/pebble/system/vibe/</path>
    <filename>vibe_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>VibePulse</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>gabbe12c91a0e3541c91618e6765204e19</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseShort</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19ae9aaea4d3226665ad0772d40537a1319</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseLong</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19a362ca2d17606221941dfa679ddb9ecbe</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseDouble</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19ae2653abdfc98405084bd8d0da715af1c</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_pulse</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga06fdc71bb88f3abae23d9c6ac8ef7c8e</anchor>
      <arglist>(VibePulse pulse)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_custom</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga005b71470c6beaa166cd9cc7c5cf10b1</anchor>
      <arglist>(const uint32_t *durations, uint32_t num_segments)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_choice</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga68e3aacc6c4efcb6b2827627e09da299</anchor>
      <arglist>(uint8_t choice)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_bt_transition</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga9b510de5a24f5136dfb470f5aa6aafd5</anchor>
      <arglist>(bool connected)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>engine.c</name>
    <path>src/c/pebble/ui/engine/</path>
    <filename>engine_8c.html</filename>
    <includes id="engine_8h" name="engine.h" local="yes" import="no" module="no" objc="no">ui/engine/engine.h</includes>
    <includes id="cstring__fit_8h" name="cstring_fit.h" local="yes" import="no" module="no" objc="no">text/cstring_fit.h</includes>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>draw_update</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>acea3c30698a26ada1bf81c4b8bff34a4</anchor>
      <arglist>(Layer *layer, GContext *ctx)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>build</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a79a6b7fc5a64b226b38077e891474536</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>destroy</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>aa52351d1dfae43c635aa490655abf35a</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_init</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga80e9c91268f57dc6bd9233afc9d7a19f</anchor>
      <arglist>(Window *window, EngineBuild build_cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_deinit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga371c44d7e8c48ce708a69bfd413a2a0e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_rebuild</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga878b25483298cd1601b2191e7eb9da87</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>repaint_slot</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>aa951c14b92f78cf5e7dd25b4ebf47007</anchor>
      <arglist>(uint8_t i)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaec392c631ca5f1420f4ad730f2c0c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty_tags</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga8cfbff710717e1257d8545775d7171b0</anchor>
      <arglist>(uint32_t changed)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static Window *</type>
      <name>s_window</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a3ddf81e700000ec6ae43c39a1be82d1c</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static EngineBuild</type>
      <name>s_build</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>ad322bae72e6bc943d51af5902a99a3ad</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static EngineSlot</type>
      <name>s_slots</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a01fb1f0b7c05dba36e53d2dbb10399a0</anchor>
      <arglist>[ENGINE_MAX_SLOTS]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static Layer *</type>
      <name>s_layers</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a909c063122f3aa3d55132a57c933431d</anchor>
      <arglist>[ENGINE_MAX_SLOTS]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static TextLayer *</type>
      <name>s_text_layers</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>ab6aacb721186c806b81243810c84db56</anchor>
      <arglist>[ENGINE_MAX_SLOTS]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static char</type>
      <name>s_last_text</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a4d0081c02703d45434f7c88b613044ec</anchor>
      <arglist>[ENGINE_MAX_SLOTS][24]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint8_t</type>
      <name>s_count</name>
      <anchorfile>engine_8c.html</anchorfile>
      <anchor>a7e54b2f45f314ed1fcc886592c28d8ea</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>engine.h</name>
    <path>src/c/pebble/ui/engine/</path>
    <filename>engine_8h.html</filename>
    <includes id="zone_8h" name="zone.h" local="yes" import="no" module="no" objc="no">ui/zone.h</includes>
    <class kind="struct">EngineSlot</class>
    <member kind="define">
      <type>#define</type>
      <name>ENGINE_MAX_SLOTS</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga36e1ce7a039108d509b546091b2f81ea</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>uint8_t(*)</type>
      <name>EngineBuild</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gafb4e0c889ad43fc740ce8968464eead4</anchor>
      <arglist>(EngineSlot *out, uint8_t max, GRect bounds)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_init</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga80e9c91268f57dc6bd9233afc9d7a19f</anchor>
      <arglist>(Window *window, EngineBuild build)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_deinit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga371c44d7e8c48ce708a69bfd413a2a0e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_rebuild</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga878b25483298cd1601b2191e7eb9da87</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaec392c631ca5f1420f4ad730f2c0c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty_tags</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga8cfbff710717e1257d8545775d7171b0</anchor>
      <arglist>(uint32_t changed)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>fonts.c</name>
    <path>src/c/pebble/ui/</path>
    <filename>fonts_8c.html</filename>
    <includes id="fonts_8h" name="fonts.h" local="yes" import="no" module="no" objc="no">ui/fonts.h</includes>
    <member kind="function">
      <type>void</type>
      <name>fonts_register</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad49c536818ff15a0e7535e258fbdd59b</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_register_system</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac0a1fd4baa979be69b65a646fd457ad8</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>GFont</type>
      <name>fonts_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7a313b71a1524d1183f9163522710472</anchor>
      <arglist>(FontId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_unload_all</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab7fb11d15d23d2ef37c4baa9db129ee1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static GFont</type>
      <name>s_fonts</name>
      <anchorfile>fonts_8c.html</anchorfile>
      <anchor>ae4b5b3aaed5630b21c309b7ba50e6298</anchor>
      <arglist>[FONT_SLOTS_MAX]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static bool</type>
      <name>s_owned</name>
      <anchorfile>fonts_8c.html</anchorfile>
      <anchor>a3d76776bb273826e38fd579317266275</anchor>
      <arglist>[FONT_SLOTS_MAX]</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>fonts.h</name>
    <path>src/c/pebble/ui/</path>
    <filename>fonts_8h.html</filename>
    <member kind="define">
      <type>#define</type>
      <name>FONT_SLOTS_MAX</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga4ca1872518ba74eea31ab554588e7398</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>uint8_t</type>
      <name>FontId</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga8cad323339ccb30f88dae519c4e198f5</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_register</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad49c536818ff15a0e7535e258fbdd59b</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_register_system</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac0a1fd4baa979be69b65a646fd457ad8</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>GFont</type>
      <name>fonts_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7a313b71a1524d1183f9163522710472</anchor>
      <arglist>(FontId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_unload_all</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab7fb11d15d23d2ef37c4baa9db129ee1</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>icon_cache.c</name>
    <path>src/c/pebble/ui/</path>
    <filename>icon__cache_8c.html</filename>
    <includes id="icon__cache_8h" name="icon_cache.h" local="yes" import="no" module="no" objc="no">ui/icon_cache.h</includes>
    <class kind="struct">IconEntry</class>
    <member kind="define">
      <type>#define</type>
      <name>ICON_CACHE_MAX</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>a25fec78ed8dc40aafa0ee6173a93e661</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_tint</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gafa86e8ce9e0e424a0bb3b08e7dd3c04e</anchor>
      <arglist>(GBitmap *bmp, GColor color)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint8_t</type>
      <name>px_alpha</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>aa9b17bd6491a4fb807f99fb1b0a66a40</anchor>
      <arglist>(GBitmapFormat fmt, const uint8_t *data, const GColor *palette, int x)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins_of</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gabad4c43378e5bd3628da4131b2343ad5</anchor>
      <arglist>(GBitmap *bmp)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static IconEntry *</type>
      <name>icon_entry</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>aaa420ba9eb1f45c44be31a81a75e521c</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>GBitmap *</type>
      <name>icon_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7968af6a0c5eadec10e501121ec97760</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga2040f8e16081e8b48289641c6914c73f</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>GSize</type>
      <name>icon_size</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa15abf7931b6be2b608974a6c263c56e</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_align_trim</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab859f1d276edd74cad316c2b811d79cc</anchor>
      <arglist>(GAlign align, IconMargins m, int *trim_dx, int *trim_dy)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icons_cleanup</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga3b5138fb45e8c6ce2ed2648318eefdab</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static IconEntry</type>
      <name>s_cache</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>a18da54972932ec5215eb68625bc9b2fc</anchor>
      <arglist>[ICON_CACHE_MAX]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint8_t</type>
      <name>s_cache_count</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>a087e3f140143741a1c109e184bb4f93c</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint32_t</type>
      <name>s_use_clock</name>
      <anchorfile>icon__cache_8c.html</anchorfile>
      <anchor>a8525e491c3ae583afac48b8313e3fc40</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>icon_cache.h</name>
    <path>src/c/pebble/ui/</path>
    <filename>icon__cache_8h.html</filename>
    <class kind="struct">IconMargins</class>
    <member kind="define">
      <type>#define</type>
      <name>ICON_AUTOTRIM</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga0218b6d868d6c02e798e1f43e04a8d28</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>ICON_TRIM_LOG</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gacd235799baa707d5f8b99169732c0625</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>GBitmap *</type>
      <name>icon_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7968af6a0c5eadec10e501121ec97760</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>GSize</type>
      <name>icon_size</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa15abf7931b6be2b608974a6c263c56e</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga2040f8e16081e8b48289641c6914c73f</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins_of</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gabad4c43378e5bd3628da4131b2343ad5</anchor>
      <arglist>(GBitmap *bmp)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_tint</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gafa86e8ce9e0e424a0bb3b08e7dd3c04e</anchor>
      <arglist>(GBitmap *bmp, GColor color)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_align_trim</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab859f1d276edd74cad316c2b811d79cc</anchor>
      <arglist>(GAlign align, IconMargins margins, int *trim_dx, int *trim_dy)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icons_cleanup</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga3b5138fb45e8c6ce2ed2648318eefdab</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>readouts.c</name>
    <path>src/c/pebble/ui/</path>
    <filename>readouts_8c.html</filename>
    <includes id="readouts_8h" name="readouts.h" local="yes" import="no" module="no" objc="no">ui/readouts.h</includes>
    <includes id="beats_8h" name="beats.h" local="yes" import="no" module="no" objc="no">clock/beats.h</includes>
    <includes id="time__store_8h" name="time_store.h" local="yes" import="no" module="no" objc="no">io/stores/time_store.h</includes>
    <includes id="health__store_8h" name="health_store.h" local="yes" import="no" module="no" objc="no">io/stores/health_store.h</includes>
    <includes id="weather__store_8h" name="weather_store.h" local="yes" import="no" module="no" objc="no">io/stores/weather_store.h</includes>
    <includes id="location__store_8h" name="location_store.h" local="yes" import="no" module="no" objc="no">io/stores/location_store.h</includes>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <includes id="setting__values_8h" name="setting_values.h" local="yes" import="no" module="no" objc="no">system/settings/setting_values.h</includes>
    <includes id="units_8h" name="units.h" local="yes" import="no" module="no" objc="no">system/units/units.h</includes>
    <includes id="text__case_8h" name="text_case.h" local="yes" import="no" module="no" objc="no">text/text_case.h</includes>
    <includes id="wx__label_8h" name="wx_label.h" local="yes" import="no" module="no" objc="no">weather/wx_label.h</includes>
    <member kind="function">
      <type>void</type>
      <name>readout_time</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5f1ce126b5f8ddfb48e78d1077355883</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_meridiem</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad7314f0630f01d77249d12b3f5018d20</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_date</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga27e66e5fb5efa50e5cd3a641ca95f3e1</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>readout_date_shows_beats</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac815591cccd1783227eb1a656212c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_hr</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab74d674a3402d0c3ccb145f54ee4d5dc</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_steps</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga46b62b70722c1a8885049b5dd237aa7e</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_temp</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaee4e7d275341c91bdbae7a5adc7ddc09</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_cond</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5d4d51464278e6e297e35ecf92b88666</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lat</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa2fe71cbe1755aae8977cad2d17e71ed</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lon</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gacea2f8a4dcf1bff5344807e02a4842aa</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>readouts.h</name>
    <path>src/c/pebble/ui/</path>
    <filename>readouts_8h.html</filename>
    <member kind="function">
      <type>void</type>
      <name>readout_time</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5f1ce126b5f8ddfb48e78d1077355883</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_meridiem</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad7314f0630f01d77249d12b3f5018d20</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_date</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga27e66e5fb5efa50e5cd3a641ca95f3e1</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>readout_date_shows_beats</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac815591cccd1783227eb1a656212c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_hr</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab74d674a3402d0c3ccb145f54ee4d5dc</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_steps</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga46b62b70722c1a8885049b5dd237aa7e</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_temp</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaee4e7d275341c91bdbae7a5adc7ddc09</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_cond</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5d4d51464278e6e297e35ecf92b88666</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lat</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa2fe71cbe1755aae8977cad2d17e71ed</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lon</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gacea2f8a4dcf1bff5344807e02a4842aa</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>icons.c</name>
    <path>src/c/pebble/ui/weather/</path>
    <filename>icons_8c.html</filename>
    <includes id="icons_8h" name="icons.h" local="yes" import="no" module="no" objc="no">ui/weather/icons.h</includes>
  </compound>
  <compound kind="file">
    <name>icons.h</name>
    <path>src/c/pebble/ui/weather/</path>
    <filename>icons_8h.html</filename>
    <includes id="wire__caps_8g_8h" name="wire_caps.g.h" local="yes" import="no" module="no" objc="no">wire/wire_caps.g.h</includes>
    <member kind="function">
      <type>uint32_t</type>
      <name>wx_resource_for</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga9a50b66845b71a795a1739d45b510875</anchor>
      <arglist>(const char *condition)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>icons_table.g.h</name>
    <path>src/c/pebble/ui/weather/</path>
    <filename>icons__table_8g_8h.html</filename>
    <member kind="function" static="yes">
      <type>static uint32_t</type>
      <name>wx_resource_for_table</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7bdf911d493eb75876b96a13b80a6e41</anchor>
      <arglist>(const char *condition)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>zone.c</name>
    <path>src/c/pebble/ui/</path>
    <filename>zone_8c.html</filename>
    <includes id="zone_8h" name="zone.h" local="yes" import="no" module="no" objc="no">ui/zone.h</includes>
    <member kind="function">
      <type>TextLayer *</type>
      <name>zone_make_layer</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga43295bc3eba00fc026a19f6533e2533b</anchor>
      <arglist>(Layer *parent, const Zone *zone)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>text_width</name>
      <anchorfile>zone_8c.html</anchorfile>
      <anchor>a0ea4a7818cf122b46d82952aa93168b7</anchor>
      <arglist>(const char *text, GFont font, GTextAlignment align)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>zone_set_text_fit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga9caa8b2be1e2c9459049c7e6a37d8f7b</anchor>
      <arglist>(TextLayer *layer, const Zone *zone, const char *text)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>zone.h</name>
    <path>src/c/pebble/ui/</path>
    <filename>zone_8h.html</filename>
    <includes id="fonts_8h" name="fonts.h" local="yes" import="no" module="no" objc="no">ui/fonts.h</includes>
    <class kind="struct">Zone</class>
    <member kind="function">
      <type>TextLayer *</type>
      <name>zone_make_layer</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga43295bc3eba00fc026a19f6533e2533b</anchor>
      <arglist>(Layer *parent, const Zone *zone)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>zone_set_text_fit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga9caa8b2be1e2c9459049c7e6a37d8f7b</anchor>
      <arglist>(TextLayer *layer, const Zone *zone, const char *text)</arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>dev_walk.c</name>
    <path>src/plugins/dev/c/dev/</path>
    <filename>dev__walk_8c.html</filename>
    <includes id="dev__walk_8h" name="dev_walk.h" local="yes" import="no" module="no" objc="no">dev/dev_walk.h</includes>
    <includes id="time__store_8h" name="time_store.h" local="yes" import="no" module="no" objc="no">io/stores/time_store.h</includes>
    <includes id="weather__store_8h" name="weather_store.h" local="yes" import="no" module="no" objc="no">io/stores/weather_store.h</includes>
    <includes id="health__store_8h" name="health_store.h" local="yes" import="no" module="no" objc="no">io/stores/health_store.h</includes>
    <includes id="system__store_8h" name="system_store.h" local="yes" import="no" module="no" objc="no">io/stores/system_store.h</includes>
    <includes id="location__store_8h" name="location_store.h" local="yes" import="no" module="no" objc="no">io/stores/location_store.h</includes>
    <includes id="appmessage__features_8h" name="appmessage_features.h" local="yes" import="no" module="no" objc="no">io/appmessage/appmessage_features.h</includes>
    <includes id="settings_8h" name="settings.h" local="yes" import="no" module="no" objc="no">system/settings/settings.h</includes>
    <includes id="engine_8h" name="engine.h" local="yes" import="no" module="no" objc="no">ui/engine/engine.h</includes>
    <class kind="struct">DevShot</class>
    <class kind="struct">[struct].s_fixed</class>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>seed_shot</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>a0d50aab0fcb61728053f2ac0cb2aee53</anchor>
      <arglist>(const DevShot *shot)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>apply_shot</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>a626e6bc16739d5be4d8e8ff0e4233ecb</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>tap_handler</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>a562c18803644a3ae69effdc57b5ccf91</anchor>
      <arglist>(AccelAxisType axis, int32_t direction)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_seed_stores</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>gad7d36031f9102cac1d91f9d66079d9ed</anchor>
      <arglist>(int hour, int min)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_init</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga881065800617954a0fd094063774f0d9</anchor>
      <arglist>(DevWalkMode mode, void(*apply_theme)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_deinit</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga1ff4ca8046b48b20d4d60258901384c1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static const struct @337347247241174026125101045250041056377017370105</type>
      <name>s_fixed</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>aa91d6e818850cb441758cd44ac29ef88</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static const DevShot</type>
      <name>s_shots</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>ac25bab8a664832452512cea49fba4bab</anchor>
      <arglist>[]</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static DevWalkMode</type>
      <name>s_mode</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>a0dfed1fc4a58a0b8d59b3c8cfc20b767</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static void(*)</type>
      <name>s_apply_theme</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>a64a674fa95930169baa46bbb3ac437c4</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static uint8_t</type>
      <name>s_theme</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>afcaa9a965b7eaadd0552070c0b7eeb82</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static int</type>
      <name>s_hour</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>ab37f9bc781877575967ffb6110c32529</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable" static="yes">
      <type>static int</type>
      <name>s_minute</name>
      <anchorfile>dev__walk_8c.html</anchorfile>
      <anchor>ab5090bdb6421b46ebdbb010b88a0dae2</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="file">
    <name>dev_walk.h</name>
    <path>src/plugins/dev/c/dev/</path>
    <filename>dev__walk_8h.html</filename>
    <member kind="enumeration">
      <type></type>
      <name>DevWalkMode</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>gabd7169bdf3c69ae6ffe751b975f1fadd</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DEV_WALK_NONE</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ggabd7169bdf3c69ae6ffe751b975f1faddae5c1f92f3e0ce1d4f302715625f3d2ca</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DEV_WALK_THEMES</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ggabd7169bdf3c69ae6ffe751b975f1faddac0d36779d185db570fe780315e64261d</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_seed_stores</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>gad7d36031f9102cac1d91f9d66079d9ed</anchor>
      <arglist>(int hour, int min)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_init</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga881065800617954a0fd094063774f0d9</anchor>
      <arglist>(DevWalkMode mode, void(*apply_theme)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_deinit</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga1ff4ca8046b48b20d4d60258901384c1</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>[struct].s_fixed</name>
    <filename>struct_0fstruct_0e_8s__fixed.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>calories</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>a3aef642ea830252c418387bb9331342c</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>sleep_min</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>a85a2a81d7e03a3f25205c85b1f08d8dd</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>active_min</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>acbb3138223564be2d44b7f7cd1abd26f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>distance_m</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>a4ad4a4626c800920155f2409f1d71226</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>lat</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>a74b97d14e2be5e70d0ad5e79dd53e265</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>lon</name>
      <anchorfile>struct_0fstruct_0e_8s__fixed.html</anchorfile>
      <anchor>aededa9781856985a2837fa0d086a38ef</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>[struct].s_handlers</name>
    <filename>struct_0fstruct_0e_8s__handlers.html</filename>
    <member kind="variable">
      <type>WeatherHandler</type>
      <name>on_weather</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>a69f4025ef640e22fdbdfd1b8abda2563</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CoordsHandler</type>
      <name>on_coords</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>ac75dc0a5cf7ad1a997637c47e0f21b03</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>SettingsChangedHandler</type>
      <name>on_settings_changed</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>aea93a03a20cd498ea7b38fd7878944b5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>UnitChangedHandler</type>
      <name>on_unit_changed</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>a16abc213f8353b8189883a65cc18c656</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>StockStripHandler</type>
      <name>on_stock_strip</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>a9956f39bd575f4584916564bd5703ef7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CalendarStripHandler</type>
      <name>on_calendar_strip</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>ae620e28c9358d52d80d1c44736a01299</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CustomColorsHandler</type>
      <name>on_custom_colors</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>a4af2fcbe1312196adbfee82a78b6c585</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CustomColorsProvider</type>
      <name>custom_colors_provider</name>
      <anchorfile>struct_0fstruct_0e_8s__handlers.html</anchorfile>
      <anchor>a03250f868919dfc3d4477ad54741f30e</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>[struct].s_state</name>
    <filename>struct_0fstruct_0e_8s__state.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>hr</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a69dfa550f32ab21f5c6c5d378d8acd7f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>hr_history</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>aa1403b090a51b63b44fc26d18b223ecd</anchor>
      <arglist>[HR_HISTORY_MINUTES]</arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>hr_last_min</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a904cb62852ca7f16f0327e7cd4f42c28</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>steps</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>ae463a880e2607355d222974f60b31907</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>calories</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a87fa654bed2286d1a29fa1d3815c44d2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>sleep_min</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a4ff82846014207e0597ba097ec0aa0c8</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>active_min</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a11d0ef78d29da6a774cd888998da275f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>distance_m</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a6bae943d352d4ea4b1a3f3085e626110</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>step_hourly</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a1a731941f4d99830ba17815282c90acd</anchor>
      <arglist>[HOURS_PER_DAY]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>step_hours</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>af28c994c7865eaf51cd5f3c2afdbc390</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>tag</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a6b42b043dd8aa439301e3ef7f088d97e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>lat</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a49d22b97f22f8f3b5f52e9c3f5320abd</anchor>
      <arglist>[20]</arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>lon</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>ab9a6be89c66daedb8c2c8cf463e543e9</anchor>
      <arglist>[20]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>battery_level</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a5342d9c4d055ae70b79f91132fa02d4b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>charging</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>addc8e821b664e115fe20565aa835a42d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>bluetooth_connected</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a94f35b808bfbb716cfd01ef016aae882</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CalendarStrip</type>
      <name>strip</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a159cde20b06213ce3c284be791802f9d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>last_sync</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a76fab064443fccad957cca54b5bf2c27</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>tag</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>aa3436b4f53e574810565c9b29d0042d5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>StockStrip</type>
      <name>strip</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a67444768cf8bf88bd0e079bfc6f9378a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>last_sync</name>
      <anchorfile>struct_0fstruct_0e_8s__state.html</anchorfile>
      <anchor>a71acacf736c0662ae8a364a757778e46</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CalendarConfig</name>
    <filename>structCalendarConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structCalendarConfig.html</anchorfile>
      <anchor>a686613ad49821e6aab85b1ff80eb9ac7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>poll_min</name>
      <anchorfile>structCalendarConfig.html</anchorfile>
      <anchor>acb8009a48a79bd45de23069a2a9160f8</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>persist_key</name>
      <anchorfile>structCalendarConfig.html</anchorfile>
      <anchor>a28bab0644bbdd2302aea9e28f11b1dc8</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CalendarEvent</name>
    <filename>structCalendarEvent.html</filename>
    <member kind="variable">
      <type>time_t</type>
      <name>start</name>
      <anchorfile>structCalendarEvent.html</anchorfile>
      <anchor>a35709dd02442840c04c3b8f55df74bd9</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>end</name>
      <anchorfile>structCalendarEvent.html</anchorfile>
      <anchor>a69c9ffe9bd08ab6d24ba17bedd033be4</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>all_day</name>
      <anchorfile>structCalendarEvent.html</anchorfile>
      <anchor>a169531a172f31f86d98b773c59209a04</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>title</name>
      <anchorfile>structCalendarEvent.html</anchorfile>
      <anchor>a6fc555791791a4a6738122267e7891fa</anchor>
      <arglist>[CAL_TITLE_LEN]</arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>location</name>
      <anchorfile>structCalendarEvent.html</anchorfile>
      <anchor>a33d3f80513e76379d78b3fa3617167ae</anchor>
      <arglist>[CAL_LOC_LEN]</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CalendarPersist</name>
    <filename>structCalendarPersist.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>tag</name>
      <anchorfile>structCalendarPersist.html</anchorfile>
      <anchor>ae1a586fe7cef0f2f8c9bd272419823a1</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>count</name>
      <anchorfile>structCalendarPersist.html</anchorfile>
      <anchor>ab7ff281f30f99dc0780b00c6a1acf883</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CalendarEvent</type>
      <name>event</name>
      <anchorfile>structCalendarPersist.html</anchorfile>
      <anchor>aec7795407c3e51ac596988c7e65e4ad1</anchor>
      <arglist>[CALENDAR_PERSIST_SLOTS]</arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>last_sync</name>
      <anchorfile>structCalendarPersist.html</anchorfile>
      <anchor>a9ba0dbe5f0bd8c2114bacc0be1385f11</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CalendarSeed</name>
    <filename>structCalendarSeed.html</filename>
    <member kind="variable">
      <type>const CalendarStrip *</type>
      <name>strip</name>
      <anchorfile>structCalendarSeed.html</anchorfile>
      <anchor>ae30b59c3ff9a7e08801f875e88e94e50</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CalendarStrip</name>
    <filename>structCalendarStrip.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>count</name>
      <anchorfile>structCalendarStrip.html</anchorfile>
      <anchor>a72c606e3a79d61f51137e7ab7630ffd2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>CalendarEvent</type>
      <name>event</name>
      <anchorfile>structCalendarStrip.html</anchorfile>
      <anchor>a0d1a09edc2e8f052753df7a6d1f23f00</anchor>
      <arglist>[CALENDAR_MAX_SLOTS]</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>CallbackList</name>
    <filename>structCallbackList.html</filename>
    <member kind="variable">
      <type>CallbackListFn *</type>
      <name>entries</name>
      <anchorfile>structCallbackList.html</anchorfile>
      <anchor>a7cb0e28a0c100340f47600574a57e79a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>max</name>
      <anchorfile>structCallbackList.html</anchorfile>
      <anchor>ad33600bd393ae2c2c781e19ac92d9daa</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>count</name>
      <anchorfile>structCallbackList.html</anchorfile>
      <anchor>abfedc29c17bb9afb36b5b966f70a9f2d</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>DevShot</name>
    <filename>structDevShot.html</filename>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>ab2b6ce3f1accb9c6755384132c4e8249</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>cond</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a33f6181cb79b77d7b3a0f7d7c7891ab7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>hr</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a61106f9c84b95b72b4da3cca2a312f74</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>steps</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a2e288d0b1865a8bde030569b98274f60</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>battery</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a071b035c65394ce86dc044d4aa3517bf</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>bluetooth</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a36e1570c506bfeec9d9e8f527a4d1123</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>quiet_icon</name>
      <anchorfile>structDevShot.html</anchorfile>
      <anchor>a7fcd16cb2a5cb8d4c948f589352e0e70</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>EngineSlot</name>
    <filename>structEngineSlot.html</filename>
    <member kind="variable">
      <type>GRect</type>
      <name>frame</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a0cc398600007b0b9eafeb67ca50b9201</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>void(*)</type>
      <name>draw</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a1b963e9e7f45ae3fdd2a683646ad1124</anchor>
      <arglist>(GContext *ctx, GRect bounds, const void *data)</arglist>
    </member>
    <member kind="variable">
      <type>const void *</type>
      <name>data</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a42d96fd8327f37c24cb80e76386ecd45</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const Zone *</type>
      <name>zone</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a69694269a011f100691b29354f0ca5c5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>void(*)</type>
      <name>text</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a8a5ac19edbcc57bc74acebfa446f4180</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>tags</name>
      <anchorfile>structEngineSlot.html</anchorfile>
      <anchor>a4587109d787749d3787c2521ec404314</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>HealthConfig</name>
    <filename>structHealthConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>a0d2006e2992c6532c1fab3102c8fda14</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>hr_history</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>ab51a8038aeefea6ecc2daa83c85c54d0</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>step_history</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>a9cb4f23e6be6dec63f49cb4707a8421b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>sleep</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>abc0f98aaaeadd8c236d39a08d7deebcf</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>active</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>a843879d7b5ad5103735e75d662e3781b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>calories</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>af6cc7bfa1e1468a1568965065272ec3a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>distance</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>ae5c2a0cad22cbfae68a1dde16c9f822b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>persist_key</name>
      <anchorfile>structHealthConfig.html</anchorfile>
      <anchor>a162f07256f08bd8dada6c12f6178cce0</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>HealthSaved</name>
    <filename>structHealthSaved.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>tag</name>
      <anchorfile>structHealthSaved.html</anchorfile>
      <anchor>aebdb6f4702918a9ec02f00d43c665fda</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>hr_history</name>
      <anchorfile>structHealthSaved.html</anchorfile>
      <anchor>a328aae865b39d96d9b4b1a3f812fd77a</anchor>
      <arglist>[HR_HISTORY_MINUTES]</arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>hr_last_min</name>
      <anchorfile>structHealthSaved.html</anchorfile>
      <anchor>a0c08244c197ab8cfa9544f175fdf7011</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>HealthSeed</name>
    <filename>structHealthSeed.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>hr</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>a164c62c872f758f093f13bb1772e3cbe</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>steps</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>a192572a06658ca20b3f0f436379b0c05</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>calories</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>aa6696d59b0ddcf768b8fd291bbc14119</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>sleep_min</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>a8a4f5427747cc9c610f9a4d762f60e82</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>active_min</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>a8be3ae0a2c011bad8f9bec3c4328b687</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>distance_m</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>aa847d55e5639320abb08555d2507c30f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const uint8_t *</type>
      <name>hr_history</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>afd4cb3c261939fd333cfbd42c93ed85a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const uint16_t *</type>
      <name>step_hourly</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>a1ed293dabaee597deaed84e6448b0eb0</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>step_hours</name>
      <anchorfile>structHealthSeed.html</anchorfile>
      <anchor>ae8ed84681436e54cc8f65a3270cea4e1</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>IconEntry</name>
    <filename>structIconEntry.html</filename>
    <member kind="variable">
      <type>uint32_t</type>
      <name>res</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>afbac9a3396568064669ee57bbeb0b533</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GBitmap *</type>
      <name>bmp</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>afe492534dca5b03d015294388fe33d3e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>IconMargins</type>
      <name>margin</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>a28ec4407002560f82c3199726fbc4d56</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GColor</type>
      <name>tint</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>aff9ed05ce2b092a889acb2cfdb5a3149</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>tinted</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>a7b9da71f47b947747679cd8eb52290bb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>used</name>
      <anchorfile>structIconEntry.html</anchorfile>
      <anchor>a11d272fabe3a08b5ab94b0190abc098a</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>IconMargins</name>
    <filename>structIconMargins.html</filename>
    <member kind="variable">
      <type>int8_t</type>
      <name>n</name>
      <anchorfile>structIconMargins.html</anchorfile>
      <anchor>a5b847402c47da2a5c68015b168b6f095</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int8_t</type>
      <name>e</name>
      <anchorfile>structIconMargins.html</anchorfile>
      <anchor>a1a468355cf81853b147b86eb299ca9d6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int8_t</type>
      <name>s</name>
      <anchorfile>structIconMargins.html</anchorfile>
      <anchor>ac096607bc2480aecff0caa913c973da6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int8_t</type>
      <name>w</name>
      <anchorfile>structIconMargins.html</anchorfile>
      <anchor>a6009de65228c00ea94faf8a265d22337</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>LocationConfig</name>
    <filename>structLocationConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structLocationConfig.html</anchorfile>
      <anchor>a83c6b320e75bb7bed8f72b441b063e33</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>persist_key</name>
      <anchorfile>structLocationConfig.html</anchorfile>
      <anchor>a4ba08972332cc0893b16546ee64ff001</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>LocationSeed</name>
    <filename>structLocationSeed.html</filename>
    <member kind="variable">
      <type>const char *</type>
      <name>lat</name>
      <anchorfile>structLocationSeed.html</anchorfile>
      <anchor>a58307502423dcd0ab844df491022d3a5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>lon</name>
      <anchorfile>structLocationSeed.html</anchorfile>
      <anchor>a525f72325d8cad6c0317e6b0d4ce469f</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>OutboxJob</name>
    <filename>structOutboxJob.html</filename>
    <member kind="variable">
      <type>OutboxKind</type>
      <name>kind</name>
      <anchorfile>structOutboxJob.html</anchorfile>
      <anchor>aa20c6b821810cd0c7e429d39ab384177</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>retries_left</name>
      <anchorfile>structOutboxJob.html</anchorfile>
      <anchor>ad67e53a2715d5da68bcfc499b76ac9f1</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>OutboxQueue</name>
    <filename>structOutboxQueue.html</filename>
    <member kind="variable">
      <type>OutboxJob</type>
      <name>queue</name>
      <anchorfile>structOutboxQueue.html</anchorfile>
      <anchor>a141b8e118c59b9bc0ca098764a31e621</anchor>
      <arglist>[OUTBOX_QUEUE_MAX]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>queue_len</name>
      <anchorfile>structOutboxQueue.html</anchorfile>
      <anchor>ab70b090f98cb6d8312839fab6df2e760</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>OutboxJob</type>
      <name>failed</name>
      <anchorfile>structOutboxQueue.html</anchorfile>
      <anchor>a92e6621d86ce15a0c8b267ccfbd104ad</anchor>
      <arglist>[OUTBOX_QUEUE_MAX]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>failed_len</name>
      <anchorfile>structOutboxQueue.html</anchorfile>
      <anchor>a8e19a14422d45c421b65bb40f9c1241f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>OutboxJob</type>
      <name>inflight</name>
      <anchorfile>structOutboxQueue.html</anchorfile>
      <anchor>a862c21cc48afbee03d844a6d56a404f0</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>SettingField</name>
    <filename>structSettingField.html</filename>
    <member kind="variable">
      <type>SettingId</type>
      <name>id</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>aec798b7f3491ac6acec2d2188063e15b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const uint32_t *</type>
      <name>message_key</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>ac8a166713eef87fb9adb5c8119c0d4dd</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>SettingType</type>
      <name>type</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>ae67eb62444a3ef84ce77260694c533c1</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>offset</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>a1d9df18c4cf838434964e182d565b4d7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>size</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>a3b8afca1c975f184271f81e55763af53</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>enum_count</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>a1b26f28a04acef7e3ea2af0b7e1f1707</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>default_num</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>ab9dc0056bfc6811d5be0dd8600042c14</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>default_str</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>a3a2055d62a14725d4f8b08a50d6546d1</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>affects_layout</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>ab9b0ae808d778bce54ba249994d87728</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>affects_weather</name>
      <anchorfile>structSettingField.html</anchorfile>
      <anchor>a5b5aa3e72da7efea998a16f6c833e4e3</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>SettingsInbound</name>
    <filename>structSettingsInbound.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>changed</name>
      <anchorfile>structSettingsInbound.html</anchorfile>
      <anchor>afe10d6eafb1c7b87bbf92d71cd16618f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>layout_changed</name>
      <anchorfile>structSettingsInbound.html</anchorfile>
      <anchor>a0191358313d7d00799bd893bc58e491f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>weather_changed</name>
      <anchorfile>structSettingsInbound.html</anchorfile>
      <anchor>a843cd791d2de3b7dc02479ba114cf969</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>SettingsSchema</name>
    <filename>structSettingsSchema.html</filename>
    <member kind="variable">
      <type>uint32_t</type>
      <name>key</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a8ebbf487f15d86af43b9aea6d0316c07</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>version</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a1ba82ee7252bbf6eac986e2e8cfcc10d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>min_versioned_size</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a423877692a5620c67cc25c955455a635</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>void *</type>
      <name>blob</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a438d6811d84f07c545ee4446c8fa9c5b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>blob_size</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a596fbeb3c05f172304792c0479cea8cb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const SettingField *</type>
      <name>fields</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a0c8a65bed4b4810a0d8b5aa38b7ea2ed</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>field_count</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a06d990933c3f595e205f7cca8a63a5eb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool(*)</type>
      <name>migrate</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a98dd2666626795edfc3593fd9880b495</anchor>
      <arglist>(int stored_size)</arglist>
    </member>
    <member kind="variable">
      <type>const struct SettingsSchema *</type>
      <name>companion</name>
      <anchorfile>structSettingsSchema.html</anchorfile>
      <anchor>a0ca782030ce421247e781ebb459f438e</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StockConfig</name>
    <filename>structStockConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structStockConfig.html</anchorfile>
      <anchor>ae0699f32855948ce685614e570317f38</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>poll_min</name>
      <anchorfile>structStockConfig.html</anchorfile>
      <anchor>a26c88d84596dd4347fe66f69a84fc698</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>persist_key</name>
      <anchorfile>structStockConfig.html</anchorfile>
      <anchor>a35aea9539901a173b4dc1343054dff80</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StockSeed</name>
    <filename>structStockSeed.html</filename>
    <member kind="variable">
      <type>const StockStrip *</type>
      <name>strip</name>
      <anchorfile>structStockSeed.html</anchorfile>
      <anchor>ad8f30db92dc3f9f9c3127c38b6aa58ca</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StockSlot</name>
    <filename>structStockSlot.html</filename>
    <member kind="variable">
      <type>char</type>
      <name>symbol</name>
      <anchorfile>structStockSlot.html</anchorfile>
      <anchor>a297cf0bffbcaf225d6be1979660efbb0</anchor>
      <arglist>[STOCK_SYMBOL_LEN]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>price_cents</name>
      <anchorfile>structStockSlot.html</anchorfile>
      <anchor>a5256275b025aa00f48cc430f0fb775be</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>change_pct</name>
      <anchorfile>structStockSlot.html</anchorfile>
      <anchor>a8dd9ac04b08e83a1400323dcd32e76f8</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>ok</name>
      <anchorfile>structStockSlot.html</anchorfile>
      <anchor>afcd50802e50f27fd66ede857cd333679</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StockStrip</name>
    <filename>structStockStrip.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>count</name>
      <anchorfile>structStockStrip.html</anchorfile>
      <anchor>a42f670ac4726b7bda534a6a5b0856b03</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>StockSlot</type>
      <name>slot</name>
      <anchorfile>structStockStrip.html</anchorfile>
      <anchor>ab649e5971b963e25791eed01a504bded</anchor>
      <arglist>[STOCK_MAX_SLOTS]</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StoreFetch</name>
    <filename>structStoreFetch.html</filename>
    <member kind="variable">
      <type>StorePoll</type>
      <name>poll</name>
      <anchorfile>structStoreFetch.html</anchorfile>
      <anchor>a5b02e91cae8fecfcff25a25c162bd923</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>AppTimer *</type>
      <name>timer</name>
      <anchorfile>structStoreFetch.html</anchorfile>
      <anchor>a4850747c6e69fbb4bfbd859aa8ca8d14</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>void(*)</type>
      <name>request</name>
      <anchorfile>structStoreFetch.html</anchorfile>
      <anchor>a6faa1b9a94dd4e7faf5bb6ff5de4087d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>first_ms</name>
      <anchorfile>structStoreFetch.html</anchorfile>
      <anchor>a57bae37532649062e21d44b21b93a0ff</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>StorePoll</name>
    <filename>structStorePoll.html</filename>
    <member kind="variable">
      <type>time_t</type>
      <name>next</name>
      <anchorfile>structStorePoll.html</anchorfile>
      <anchor>a324f51d57d9b85613a6ea5ab1c6411e7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>poll_min</name>
      <anchorfile>structStorePoll.html</anchorfile>
      <anchor>a8ddb0db53f8ee2769ef42460bbd94303</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structStorePoll.html</anchorfile>
      <anchor>ad96becb58ae977574a0b761caa011cb8</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>SystemConfig</name>
    <filename>structSystemConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structSystemConfig.html</anchorfile>
      <anchor>a3a51107da6d0eccf43036c688e77b2fa</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>BtVibePolicy</type>
      <name>vibe</name>
      <anchorfile>structSystemConfig.html</anchorfile>
      <anchor>a7009ff4ab3db654c9944b6cc01c4d9d2</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>SystemSeed</name>
    <filename>structSystemSeed.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>battery</name>
      <anchorfile>structSystemSeed.html</anchorfile>
      <anchor>a51e6c8c9c417fce174a71a3ba8d3994d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>charging</name>
      <anchorfile>structSystemSeed.html</anchorfile>
      <anchor>a709c393ec6012a6fccd8bfba55c21594</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>bluetooth</name>
      <anchorfile>structSystemSeed.html</anchorfile>
      <anchor>aace126b5167d9b3e1b8b6caa82717dee</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>next_alarm</name>
      <anchorfile>structSystemSeed.html</anchorfile>
      <anchor>ab5d79666596362e29fc16f637bb07ae7</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>TimeBand</name>
    <filename>structTimeBand.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>start_min</name>
      <anchorfile>structTimeBand.html</anchorfile>
      <anchor>a740086bb48f2ad7e76e859f9eb151232</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>span_min</name>
      <anchorfile>structTimeBand.html</anchorfile>
      <anchor>a9841d94a14ac1b0ca9e1f33868437da5</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>TimeBandSpan</name>
    <filename>structTimeBandSpan.html</filename>
    <member kind="variable">
      <type>int</type>
      <name>from</name>
      <anchorfile>structTimeBandSpan.html</anchorfile>
      <anchor>a3e97f13ab587ef30e42ededc9f0a595b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>to</name>
      <anchorfile>structTimeBandSpan.html</anchorfile>
      <anchor>a0520d74d4aa34d60477daf1e2845e6e7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>clipped_start</name>
      <anchorfile>structTimeBandSpan.html</anchorfile>
      <anchor>a9a878a11dc8dcb894f60e121ffb50c20</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>clipped_end</name>
      <anchorfile>structTimeBandSpan.html</anchorfile>
      <anchor>abb8db41808468ee3b0693a2a427e12c9</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>TimeConfig</name>
    <filename>structTimeConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structTimeConfig.html</anchorfile>
      <anchor>af951cac1e7733963949ff707dcfe650e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>minute_tick</name>
      <anchorfile>structTimeConfig.html</anchorfile>
      <anchor>a2c93b890d0d369c7e4b82648bac39d20</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>beats</name>
      <anchorfile>structTimeConfig.html</anchorfile>
      <anchor>a9f051ec76f4f1a95058f5ec52506aabc</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherClock</name>
    <filename>structWeatherClock.html</filename>
    <member kind="variable">
      <type>time_t</type>
      <name>now</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a9fdd4c975baaa069590ed44b86c207a1</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>day_start</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a3ae8fad6167ba4194d754c420fed06cb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>hour</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a8ff4a083b881047a4608b0d328c3b6e6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>minute</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a7562e2fafbe4bd092596ab24d60c1c21</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>second</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a392bd2d9e6c9ecc8247663108492fcbb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>wday</name>
      <anchorfile>structWeatherClock.html</anchorfile>
      <anchor>a8e6c870f60a2694eaa5e8af7755bf724</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherConfig</name>
    <filename>structWeatherConfig.html</filename>
    <member kind="variable">
      <type>bool</type>
      <name>live</name>
      <anchorfile>structWeatherConfig.html</anchorfile>
      <anchor>ad002199ba6f3a4b7af38924a8bb640e7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>poll_min</name>
      <anchorfile>structWeatherConfig.html</anchorfile>
      <anchor>ae74aa3985257e1cabb55468fb482cba4</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint32_t</type>
      <name>persist_key</name>
      <anchorfile>structWeatherConfig.html</anchorfile>
      <anchor>aea465941bd98b1490454738c7af6088e</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherDaily</name>
    <filename>structWeatherDaily.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>count</name>
      <anchorfile>structWeatherDaily.html</anchorfile>
      <anchor>abbd4a49f7df11b0756e1418e49fb391b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>base_weekday</name>
      <anchorfile>structWeatherDaily.html</anchorfile>
      <anchor>af780eee24c1b9f82b788f4fdcd7379c8</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>WeatherDayCol</type>
      <name>col</name>
      <anchorfile>structWeatherDaily.html</anchorfile>
      <anchor>a989f24bc5dd7bd2740be75a9b1be6904</anchor>
      <arglist>[WEATHER_FORECAST_COLS]</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherDayCol</name>
    <filename>structWeatherDayCol.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>code</name>
      <anchorfile>structWeatherDayCol.html</anchorfile>
      <anchor>ac38766be593b08c4c3abdc4a89626203</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp_max</name>
      <anchorfile>structWeatherDayCol.html</anchorfile>
      <anchor>ad3f35b86fa0243cf336df447a5823c64</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp_min</name>
      <anchorfile>structWeatherDayCol.html</anchorfile>
      <anchor>a07060351177da6c12bd309d7c76e79ab</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherHourCol</name>
    <filename>structWeatherHourCol.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>code</name>
      <anchorfile>structWeatherHourCol.html</anchorfile>
      <anchor>ae088f957b24a2f5b36846803d1e1b383</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp</name>
      <anchorfile>structWeatherHourCol.html</anchorfile>
      <anchor>a1775eddd69fb1c024595af53454d0e22</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherHourly</name>
    <filename>structWeatherHourly.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>count</name>
      <anchorfile>structWeatherHourly.html</anchorfile>
      <anchor>ad43f77992787c31c31ee2048e367a58e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>base_hour</name>
      <anchorfile>structWeatherHourly.html</anchorfile>
      <anchor>ad7a834d6b6571d80f22136ef20ef9e41</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint8_t</type>
      <name>step_hours</name>
      <anchorfile>structWeatherHourly.html</anchorfile>
      <anchor>a7cc8b049ea31e32b4c89ee2f49294eaa</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>WeatherHourCol</type>
      <name>col</name>
      <anchorfile>structWeatherHourly.html</anchorfile>
      <anchor>a6bac632eda867f46146ff87090e81473</anchor>
      <arglist>[WEATHER_FORECAST_COLS]</arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherMessage</name>
    <filename>structWeatherMessage.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>groups</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a2ef77286e2f02067ca9e7437aca389a6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>bool</type>
      <name>ok</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a328318e4aa166fec155634010ddf8431</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a975df3054641eddb181006370fe704be</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>cond</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>af788f75769fe248ae57b11f9eb626fdd</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>humidity</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a58ad44b76adbf7e94a0b5acb50c04783</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>wind_kmh</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a16481e6e0f37ab4e8d86756af480984b</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>wind_dir</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a51a1436b6e9630b7f1c9f9c420607120</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>cond_label</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>ad6aae8415749e405ce9892c61daa06cb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>sunrise</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a423bfb57af732fbe40889a50a5d6604f</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>sunset</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a2adc5a90619bd4a3572ff13fc54bf45c</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>uv</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>aa64e5b7422e22ec1eb018b0afe7bf56d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_max</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a217ead73acf2ca31c797d0e536dfff33</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_min</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a16a30cff51ac31165840714b5bac5227</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>precip_chance</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a196b4cbc8502c9c6e24d1040d4ff8ce2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>feels_like</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>ace9fa48992630d940ef2fbd4e21dfd05</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>pressure</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>ae9d770ab1a1756f491395ca35cf2014e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>dew_point</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a9b16dd1fd8f5a9f6ee2c3d7902e57368</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const uint8_t *</type>
      <name>hourly</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a7b03071ef02a2a9a5906f65735f1b010</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>hourly_len</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a9137b2f3ba3f619fbecd49e518a97bcb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const uint8_t *</type>
      <name>daily</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>afc89d1fd8b8de86ea19a1704a0623543</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>uint16_t</type>
      <name>daily_len</name>
      <anchorfile>structWeatherMessage.html</anchorfile>
      <anchor>a2246248b9662e9e1bd5ca6c8ed1a4096</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherSeed</name>
    <filename>structWeatherSeed.html</filename>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a800405640fdfe30f5f50c13c2ff784c6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>cond</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a93c60f615195612444d3d584e7a669cb</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>humidity</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a3283c2db1cab5449deea79f7ec44ff4d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>wind_kmh</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a709b8a2cb2aa19136736b221aa2b600d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>wind_dir</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>abe78d980ed72ae675e9e9c4aac94baf5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const char *</type>
      <name>cond_label</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>aa97c3694fa89fbfa1c502bdd12b33a91</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>sunrise</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>aba05dbb6d3d4c5affa61bd1bfab8fdf4</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>sunset</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>addb3dcd8ffd37faf745214d6503b30cf</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>uv</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>af976c15fe0ef750a0e83a1250f6bea43</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_max</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a61eddb007829da41b47f94582d5c43a6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_min</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a961fe24ad83d628b251f98ad0e96b32d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>precip_chance</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a87dffebd1350edddd8bff9f6488f6437</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>feels_like</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>abb6bbc297a857aaca63ced30f49e05e7</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>pressure</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a90ff9b074f7922ebde4f03d1acb34902</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>dew_point</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a0511b520955d08ad1183532ad35cb828</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const WeatherHourly *</type>
      <name>forecast_hourly</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>afa5fea3e4ef452f8a9fedf2f5d125a04</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>const WeatherDaily *</type>
      <name>forecast_daily</name>
      <anchorfile>structWeatherSeed.html</anchorfile>
      <anchor>a982b6926993492b778b20d9fbf5e6bcb</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>WeatherState</name>
    <filename>structWeatherState.html</filename>
    <member kind="variable">
      <type>uint8_t</type>
      <name>tag</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>ada60a92f0690b1a06bca06d42984ae7a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>temp</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>ae41f90ba55b0a7b7f53812816ee435d0</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>cond</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a7e43f225b231eed29dffcecb9f8c7d2f</anchor>
      <arglist>[32]</arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>cond_label</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>aff9f98e3f9cbf2fab7b41e46d7552c56</anchor>
      <arglist>[20]</arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>humidity</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>aab2b5a749e4b0f1b2e4a98e04e811694</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>wind_kmh</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>ac89a66ed27ff84aa61675f2b78d4784e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>char</type>
      <name>wind_dir</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>ac4711deb819db30232d3cbb525ddeafe</anchor>
      <arglist>[4]</arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>sunrise</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a297b2b392f2d3752f55360f3ffd30d9d</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int16_t</type>
      <name>sunset</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a4e42b02e63c4eca428a9c75a12133583</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>uv</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a31a4fb50d7112a091d3c60d6a7f89903</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_max</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a7608d767f3af291200139974bef30df5</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>temp_min</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a1317a6f4ed770efe3bdf6352dbe7d1a2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>precip_chance</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a27ceeb5c3bd3ae1d840b53f10f8ad709</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>feels_like</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>adb364d466033e6a7031057861d40b6e2</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>pressure</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a10a0c1b94135d6c9d6ed2e49102e6e0e</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>int</type>
      <name>dew_point</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a8a4412e90af8c10f96abe56ea378170a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>forecast_day</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>af60f8192ef84bbbd9b6decd7cd2f4c77</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>WeatherHourly</type>
      <name>hourly</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a51b784635421b939e7c3d77c78523d92</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>hourly_first</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a0880368890fa96ac09b581c38f07f714</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>daily_first</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>aa668cd1b177bbfd27dd0a60215ea6ec9</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>WeatherDaily</type>
      <name>daily</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a0585006c516149c78970319d8bdc07b0</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>time_t</type>
      <name>last_sync</name>
      <anchorfile>structWeatherState.html</anchorfile>
      <anchor>a91c5cb1e7246a0080820a3dbb9eb689a</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="struct">
    <name>Zone</name>
    <filename>structZone.html</filename>
    <member kind="variable">
      <type>GRect</type>
      <name>rect</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a25225c676df4e85a03e75dab3df8e22a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>FontId</type>
      <name>font_id</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a34c68d9d67fb5a1616bd31447e3f9b19</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GTextAlignment</type>
      <name>align</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>ad4476b64011cab9f23f617932288e4f6</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GColor</type>
      <name>color</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a44f03b8c83bbfaac1fc3c59936584f9a</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>FontId</type>
      <name>font_id_fallback</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a1ce7118149bace3fb6260d85a0c8b159</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GRect</type>
      <name>rect_fallback</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a839f256ad624c5be0d82732ecab01f47</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>FontId</type>
      <name>font_id_fallback2</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>ae0fc160a4fcbf56dbef709fa11ed4192</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GRect</type>
      <name>rect_fallback2</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a896caa855cd84c0e6ef28c7c1856eafe</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>FontId</type>
      <name>font_id_fallback3</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>acfe63c946adc852f1475a9f8a68369c0</anchor>
      <arglist></arglist>
    </member>
    <member kind="variable">
      <type>GRect</type>
      <name>rect_fallback3</name>
      <anchorfile>structZone.html</anchorfile>
      <anchor>a9991f1fe88fcf46da0b4e4e1fbdc8aab</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_core</name>
    <title>Core Helpers</title>
    <filename>group__lib__core.html</filename>
    <file path="src/c/core/clock/">astro.c</file>
    <file path="src/c/core/clock/">astro.h</file>
    <file path="src/c/core/clock/">beats.c</file>
    <file path="src/c/core/clock/">beats.h</file>
    <file path="src/c/core/clock/">date.c</file>
    <file path="src/c/core/clock/">date.h</file>
    <file path="src/c/core/clock/">duration.c</file>
    <file path="src/c/core/clock/">duration.h</file>
    <file path="src/c/core/clock/">moon.c</file>
    <file path="src/c/core/clock/">moon.h</file>
    <file path="src/c/core/clock/">nightsched.c</file>
    <file path="src/c/core/clock/">nightsched.h</file>
    <file path="src/c/core/clock/">solar.c</file>
    <file path="src/c/core/clock/">solar.h</file>
    <file path="src/c/core/clock/">tide.c</file>
    <file path="src/c/core/clock/">tide.h</file>
    <file path="src/c/core/clock/">timeband.c</file>
    <file path="src/c/core/clock/">timeband.h</file>
    <file path="src/c/core/clock/">weekday.c</file>
    <file path="src/c/core/clock/">weekday.h</file>
    <file path="src/c/core/clock/">zone_setting.c</file>
    <file path="src/c/core/clock/">zone_setting.h</file>
    <file path="src/c/core/health/">minute_window.c</file>
    <file path="src/c/core/health/">minute_window.h</file>
    <file path="src/c/core/health/">step_hours.c</file>
    <file path="src/c/core/health/">step_hours.h</file>
    <file path="src/c/core/io/">bytes_le.h</file>
    <file path="src/c/core/io/">callback_list.c</file>
    <file path="src/c/core/io/">callback_list.h</file>
    <file path="src/c/core/layout/">layout_role.c</file>
    <file path="src/c/core/layout/">layout_role.h</file>
    <file path="src/c/core/layout/">layout_string.c</file>
    <file path="src/c/core/layout/">layout_string.h</file>
    <file path="src/c/core/math/">pct.c</file>
    <file path="src/c/core/math/">pct.h</file>
    <file path="src/c/core/math/">scale.c</file>
    <file path="src/c/core/math/">scale.h</file>
    <file path="src/c/core/math/">series.c</file>
    <file path="src/c/core/math/">series.h</file>
    <file path="src/c/core/text/">cstring_fit.h</file>
    <file path="src/c/core/text/">number_format.c</file>
    <file path="src/c/core/text/">number_format.h</file>
    <file path="src/c/core/text/">text_case.c</file>
    <file path="src/c/core/text/">text_case.h</file>
    <file path="src/c/core/units/">distance.c</file>
    <file path="src/c/core/units/">distance.h</file>
    <file path="src/c/core/units/">wind.c</file>
    <file path="src/c/core/units/">wind.h</file>
    <file path="src/c/core/weather/">forecast_age.c</file>
    <file path="src/c/core/weather/">forecast_age.h</file>
    <file path="src/c/core/weather/">weather_reading.c</file>
    <file path="src/c/core/weather/">weather_reading.h</file>
    <file path="src/c/core/weather/">wind_dir.c</file>
    <file path="src/c/core/weather/">wind_dir.h</file>
    <file path="src/c/core/weather/">wx_label.c</file>
    <file path="src/c/core/weather/">wx_label.h</file>
    <file path="src/c/core/wire/">calendar_wire.c</file>
    <file path="src/c/core/wire/">calendar_wire.h</file>
    <file path="src/c/core/wire/">coords.c</file>
    <file path="src/c/core/wire/">coords.h</file>
    <file path="src/c/core/wire/">stock_wire.c</file>
    <file path="src/c/core/wire/">stock_wire.h</file>
    <file path="src/c/core/wire/">weather_wire.c</file>
    <file path="src/c/core/wire/">weather_wire.h</file>
    <file path="src/c/core/wire/">wire_caps.g.h</file>
    <file path="src/c/core/wire/">wire_read.h</file>
    <class kind="struct">TimeBand</class>
    <class kind="struct">TimeBandSpan</class>
    <class kind="struct">CallbackList</class>
    <class kind="struct">WeatherMessage</class>
    <class kind="struct">WeatherState</class>
    <class kind="struct">WeatherClock</class>
    <class kind="struct">CalendarEvent</class>
    <class kind="struct">CalendarStrip</class>
    <class kind="struct">StockSlot</class>
    <class kind="struct">StockStrip</class>
    <class kind="struct">WeatherHourCol</class>
    <class kind="struct">WeatherDayCol</class>
    <class kind="struct">WeatherHourly</class>
    <class kind="struct">WeatherDaily</class>
    <member kind="define">
      <type>#define</type>
      <name>MOON_SYNODIC_SEC</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga550e4dc38f3305d3ad3dcd0dd394de94</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MOON_EPOCH_UTC</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf586f63d0905b47c9548a10f0310bc81</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>TIDE_PERIOD_MIN</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa01e1adc5b81c1d2cc14f870a42e5f3f</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>TIMEBAND_DAY_MINUTES</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad3c2b297779efc19aa0c02f2e8635917</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STEP_HOURS_PER_DAY</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gab582a8ca15586973977cd7f48de42fa2</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>LAYOUT_INT_MAX</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga19726e59e3c59c41210823d2d3dac836</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_CURRENT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gace94f04d01ec6679143f9937fc0d7d35</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_EXTRA</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad2a50305c20a2dc3acf340c9837a065b</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_FORECAST</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7eef9602c89fd58adb11e058618d1dd7</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_GROUP_AIR</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga49eb8281314392449d74706359777576</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CallbackListFn</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gace9c32cbf32397ccc0a34a750ce3ea68</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>NightSchedMode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga90cd678ac8db70a4a741a5ef04cd8793</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_OFF</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a6a8c99fc2f822c3b640066f69ce2d997</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_SOLAR</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a0ff4de0039a79b3e04a3052f98707a73</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>NIGHT_SCHED_FIXED</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga90cd678ac8db70a4a741a5ef04cd8793a8c275a9c35ee2c3bb0d2875a56b2b8be</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>LayoutRole</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gacc6a111ebb7ba5e35f9c1946e436943f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_DAY</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa61de7d05aeb87ca0661859381a064971</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_NIGHT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa19e9e96220840a3831e03b59067e9be5</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>LAYOUT_ROLE_QUIET</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ggacc6a111ebb7ba5e35f9c1946e436943fa518cbe3bd0c7d438b484dc05afc5c11e</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>WindUnit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga81835140b8dd390d395cd5fcf7dee1b1</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_KMH</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1aa05ca61b7909a966d95caac6d27dc51c</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_MPH</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a3d492848e908a0c4425a669ee67ee63b</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_KTS</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a60a6d323d0f94b93a78fc02d92b6545d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_MS</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1ae2b15fe48410daeee405fc533127c566</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>WIND_UNIT_COUNT</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gga81835140b8dd390d395cd5fcf7dee1b1a93a87520ef04d333e59aced98692a2ea</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>astro_jd_centi</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8847a29aa0210773d90c83257417e30d</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>beats_from_ms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga748d1547c38334f1800f0d0bf0ddfb63</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>ms_until_next_beat</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7b06de249c8214693fdf100d868f54f4</anchor>
      <arglist>(int32_t ms_into_bmt_day)</arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>beats_ms_from_hms</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga60ea394a4edab1661bfdfcec61a49a73</anchor>
      <arglist>(int hour, int minute, int second, uint16_t ms)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>beats_has_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaaed371b1b105688cc7ca824ba6ed0090</anchor>
      <arglist>(const char *format)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>beats_expand_token</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2fdfec41ce1bb098586cf3d82c921cd5</anchor>
      <arglist>(char *text, int beats)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee874b4db4f19a63aec92cf2c57defd2</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_week_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0c190d7c5d5f7d46fc36c3f04bd3e56a</anchor>
      <arglist>(int year, int yday, int wday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_iso_weeks_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga70f355976c89a7190d80f6d344631710</anchor>
      <arglist>(int year)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_day_of_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadde776e9b470fd4e9df1307415b09851</anchor>
      <arglist>(int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_left_in_year</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c68f59a1602b5e27b1a05a0d63b499c</anchor>
      <arglist>(int year, int yday)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_days_in_month</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaef88f0efc2274de9f1984658aea37f9b</anchor>
      <arglist>(int year, int mon0)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>date_first_wday</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b126160626de63678618d54227455ad</anchor>
      <arglist>(int wday, int mday)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>duration_hm</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4fe493c620f4247fb241b538db2aec72</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>duration_hm_compact</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0b34387761f2f9297553dcad5ac0f206</anchor>
      <arglist>(char *out, size_t n, int minutes)</arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>moon_age_sec</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf635be67f90fcbcc72361db3e1b899e0</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_glyph_index</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga83dfa9388ce19b76dd9f18ffc9135a67</anchor>
      <arglist>(time_t utc, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_illumination_pct</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa3fa4262c82f6312ffc7ac9a36ad08e1</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>moon_phase_name</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6a99ed843383ec7d057306db91bb91fc</anchor>
      <arglist>(time_t utc)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>moon_days_to_phase</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3c81c549c8dfe4c2751f023abfe727b7</anchor>
      <arglist>(time_t utc, bool to_full)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>clock_window_contains</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga284e05094c9084b2fca021122f13488d</anchor>
      <arglist>(int start, int end, int now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>night_schedule_active</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gab655e624866f012b97621268f0038504</anchor>
      <arglist>(int mode, int now, int rise, int set, int fixed_start, int fixed_end, bool have_night)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_day_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac982a31420ab76dbaa86ab1885c065ad</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_night_progress</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaee0b6058425e523d5393b77aceb34a54</anchor>
      <arglist>(int rise, int set, int now)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>solar_next_event</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga974fb27e5854c3558a46a423c0e9e621</anchor>
      <arglist>(int rise, int set, int now, bool *is_sunrise)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>tide_level</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ca1c1d9a5df71a89fc61da050ca3b8d</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>tide_rising</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga910d5986818e759ad59e4e50cefdbe8f</anchor>
      <arglist>(int32_t minutes)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_full_day</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2e4ca30c1616284c941596b66bcc6158</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_rolling</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga17975bf89798eeb2baacffec94111b18</anchor>
      <arglist>(int now_min, int span_min, int lead_min)</arglist>
    </member>
    <member kind="function">
      <type>TimeBand</type>
      <name>timeband_from_hour</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga1e2241cf9d353b6c48f57c9e49dbcbe9</anchor>
      <arglist>(int base_hour, int span_min)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac788ab450b30bbb9e4c0c16e2a96d1de</anchor>
      <arglist>(TimeBand band, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4d0f6578d1e429d7c77be357109a6989</anchor>
      <arglist>(TimeBand band, int length, int minute_of_day)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_pos_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga464dfe5bbece0af2f5539d0616fd7643</anchor>
      <arglist>(TimeBand band, int length, int offset_min)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>timeband_clip</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0a00805862511df587e96edc9083c7da</anchor>
      <arglist>(TimeBand band, time_t window_epoch, time_t start, time_t end, TimeBandSpan *out)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>timeband_clip_daily</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7ec5edf0ceeb305eed2d84da3130a0ba</anchor>
      <arglist>(TimeBand band, int from_min, int to_min, TimeBandSpan *out, int max_out)</arglist>
    </member>
    <member kind="function">
      <type>time_t</type>
      <name>timeband_window_epoch</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga63e7a4d00b37b74522dc6eaab727b6f8</anchor>
      <arglist>(TimeBand band, time_t now, int now_min)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weekday_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadccedafdeb6e437c664e8426bfd9812b</anchor>
      <arglist>(int wday)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>zone_setting_is_set</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga48a1bec6aa209e10ce939af6b9d53222</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>int16_t</type>
      <name>zone_setting_offset</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6654376c135443aa4f6756f406340f02</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>zone_setting_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9f625161eafd8ce62405cce899c8ff80</anchor>
      <arglist>(const char *value)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>minute_window_first_slot</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf7d993bee5b11fc9f9ea5918d9f7d991</anchor>
      <arglist>(time_t first_min, time_t end_min, int minutes)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>step_hours_settled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga998d8f2fe2b302cdff2610abd009f245</anchor>
      <arglist>(int cur_hour, int cur_min)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int16_t</type>
      <name>read_i16_le</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3fd54f4514af9738e081706d21fd44bc</anchor>
      <arglist>(const uint8_t *p)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>read_i32_le</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga7ac2e494355ca66ce8ec8bbd881e90e9</anchor>
      <arglist>(const uint8_t *p)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>callback_list_add</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaed0238885522c47e90f7a547719983bc</anchor>
      <arglist>(CallbackList *list, CallbackListFn cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>callback_list_fire</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6b4dbe785f6d28d845b326a152444ddd</anchor>
      <arglist>(const CallbackList *list)</arglist>
    </member>
    <member kind="function">
      <type>LayoutRole</type>
      <name>layout_role_pick</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga483c460c27f1f46834ac736434668598</anchor>
      <arglist>(bool quiet_on, bool quiet_set, bool night_on, bool night_set)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>layout_parse_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6de1604c8d0aab3e3a3226dccb171cce</anchor>
      <arglist>(const char **cursor)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>layout_has_any_block</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadb8a7e98c9c67c5167942ae96433c21f</anchor>
      <arglist>(const char *layout, int type_count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>pct_of</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0fa2f5ff0207c0179c689d0277bdfffd</anchor>
      <arglist>(int value, int goal)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>clamp_int</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2a3f6820b74bffadc7d6f3b88eb4916d</anchor>
      <arglist>(int value, int lo, int hi)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segment_width</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac01ee128d72ea0af440967d27c4de224</anchor>
      <arglist>(int total, int gap, int count)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>fraction_px</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga9ed357804da26e96f0ae19aa3d02873f</anchor>
      <arglist>(int total, int num, int den)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>segments_filled</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga5e3c99e7f2fade51632dd8aa3f3988f0</anchor>
      <arglist>(int level, int segments)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>plot_y</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadc6c8c4764edd2d25babbc4689eaa73b</anchor>
      <arglist>(int y0, int height, int lo, int hi, int value)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>series_range</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga4260de92aa2412a987a0d0ee799d5406</anchor>
      <arglist>(const uint8_t *samples, int count, uint8_t no_sample, int *lo, int *hi, int *last)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>series_max_u16</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga8cc817ecf16f05e721472b4f6714943a</anchor>
      <arglist>(const uint16_t *values, int count)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>cstring_fit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga48dcd72e49fa122dc562f64605efdc75</anchor>
      <arglist>(char *dst, const char *src, size_t size)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>cstring_fit_same</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga13d8bf38f7877df6836f074354b4bcb9</anchor>
      <arglist>(const char *current, const char *value, size_t size)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>number_group</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga3633a279bf5254234b2a8549d98e80de</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_int_or_dash</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga145e042f4414e0854e809ac7c7b086ca</anchor>
      <arglist>(char *buffer, size_t size, int value, const char *fmt)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_hundredths</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafa9f63d99d2011c46da1397b798fc529</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fmt_pct_signed</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gad8460f42bd55675f97ac3b2feae4fde0</anchor>
      <arglist>(char *buffer, size_t size, int value)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>copy_bounded</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2d2900400e9b136d9d176de8838c52a4</anchor>
      <arglist>(char *dst, uint8_t cap, const uint8_t *src, uint8_t len)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6334eca7eb0a33cdf25b1bb9060afa35</anchor>
      <arglist>(const char *s, uint16_t size)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>cstring_setting_is_clean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga58af7628a1a740a9fb7a220b3a472c22</anchor>
      <arglist>(const char *s, uint16_t size, const char *default_str)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>text_to_upper</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga0f128dcb6dbe22caba62e2b47c1da00a</anchor>
      <arglist>(char *s)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>distance_unit</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadad9778fe90b71058c77ee83f2f26e2e</anchor>
      <arglist>(bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format_value</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga93901c7cecf40133c250e13cf5cdb4bd</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>distance_format</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gadf1a4e77db17b89d4d0e81dc25c9bcf2</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_from_kmh</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga56c983dede8e0be266f38d389a62c371</anchor>
      <arglist>(int kmh, WindUnit unit)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>wind_unit_label</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd0dc1755ed3d4dd661c56e5c498e84d</anchor>
      <arglist>(WindUnit unit)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_hours_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga39e6efbba632aacf61875379354b1c38</anchor>
      <arglist>(int32_t seconds_into_strip, uint8_t step_hours, uint8_t count)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>forecast_days_past</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2f750b53c34d89db9ce79a2a252ebf02</anchor>
      <arglist>(int days_since_first, uint8_t count)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_reading_apply</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga2b36f0d71ccc983475ea5fa5e919e585</anchor>
      <arglist>(WeatherState *state, const WeatherMessage *msg, const WeatherClock *clock)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_reading_convert</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga6fcabd81132c73ba225beaf6f035fe5c</anchor>
      <arglist>(WeatherState *state, bool to_fahrenheit)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_bearing</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaf6fadf25dfa1b520911598ccade94119</anchor>
      <arglist>(const char *dir)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>wind_lean</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga357ae2f2cfb0a32380b717e9a8ac6ce8</anchor>
      <arglist>(int bearing)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>wx_label_short</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga174ee20c1de042aac051cdc44dc9847a</anchor>
      <arglist>(char *out, size_t n, const char *condition)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>calendar_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gafd03d47d8eb87604abcd082423036833</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, CalendarStrip *out)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>coords_look_real</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga11b6bfbd1863803faf31b81bdea9ef1f</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>stock_wire_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gacaf9695fcec823203cf5c23309448d8f</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, StockStrip *out)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_hourly_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaa8a79a3914a591d37a2080d4a9c2dd86</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherHourly *out)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>weather_daily_decode</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gac4fcf3a860dea22cf18924b3c4783405</anchor>
      <arglist>(const uint8_t *buf, uint16_t len, WeatherDaily *out)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int32_t</type>
      <name>wire_int_or</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>gaac313f9ba01fb8da75be8388287f9a7a</anchor>
      <arglist>(bool is_signed, uint16_t length, const uint8_t *value, int32_t fallback)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>wire_cstring_terminated</name>
      <anchorfile>group__lib__core.html</anchorfile>
      <anchor>ga700d7a3380b25b5472c1b580502b9b3e</anchor>
      <arglist>(const char *s, uint16_t length)</arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_io</name>
    <title>Data In and Out</title>
    <filename>group__lib__io.html</filename>
    <file path="src/c/pebble/io/appmessage/">appmessage.c</file>
    <file path="src/c/pebble/io/appmessage/">appmessage.h</file>
    <file path="src/c/pebble/io/appmessage/">appmessage_features.h</file>
    <file path="src/c/pebble/io/">outbox_queue.h</file>
    <file path="src/c/pebble/io/">tuple_read.c</file>
    <file path="src/c/pebble/io/">tuple_read.h</file>
    <class kind="struct">OutboxJob</class>
    <class kind="struct">OutboxQueue</class>
    <class kind="struct">[struct].s_handlers</class>
    <member kind="define">
      <type>#define</type>
      <name>APPMESSAGE_CUSTOM_COLORS_MAX</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga8bfcc8d396856901aeea684974fdb15c</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>OUTBOX_QUEUE_MAX</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gacb075235dabec7bf871cfc5698a42526</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>WeatherHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga5e383acfcc7c48eb2dd8caac176bf5cb</anchor>
      <arglist>(const WeatherMessage *msg)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CoordsHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga59b6055d84a446d8b469ba7ef8883030</anchor>
      <arglist>(const char *lat, const char *lon)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>SettingsChangedHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaa75e1339172964d75887a1c2b7b464fe</anchor>
      <arglist>(bool time_or_date_changed)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>UnitChangedHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6fb408316f6f72341bf67751cdbd36d9</anchor>
      <arglist>(bool fahrenheit)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>StockStripHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaad5cc31baad613ac137e95653cdab162</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CalendarStripHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaea56a19672a4978e838e9d0a8753405b</anchor>
      <arglist>(const uint8_t *buf, uint16_t len)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CustomColorsHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6daf051587a0083e33af5e4d0847f931</anchor>
      <arglist>(const char *combined)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>CustomColorsProvider</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6efc27e8b660e10498f1678ddecc05dc</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>InboxCompleteHandler</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaae586b1981cefa58e0284ec05e167205</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>OutboxKind</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga247b62ae1a0fa87cef6e3e8b7f738f17</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_NONE</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a7d25a430a1d15cc7f34d60d396174dc8</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_WEATHER</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17ab990da3519ee9e75a966f64b2a9fde49</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_SETTINGS</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a761144dce82352e049fa8cf0c4817b1c</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_FRESH</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a4abf64336b0b394adc142475e4687010</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_STOCK</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a1f1d2bff0cb91b1bde99a9eef0459e14</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>OUTBOX_CALENDAR</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gga247b62ae1a0fa87cef6e3e8b7f738f17a2061a1a93d2450838ff186868e6b3345</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga8760e9417f2f894915a0950dc1fdab07</anchor>
      <arglist>(WeatherHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_coords</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga7c64814ef2b8dcd4ee38743e31fb58d2</anchor>
      <arglist>(CoordsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_settings_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gad9d1d40d059728d240df1d07fd713323</anchor>
      <arglist>(SettingsChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_unit_changed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab58b5b73b9f4c46fa2b249e2378b71b3</anchor>
      <arglist>(UnitChangedHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_stock_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga45a5f177aabba862b779b38b5b4ed288</anchor>
      <arglist>(StockStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_calendar_strip</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga1ab2899a032be1fe4ab307e70f8bf3cd</anchor>
      <arglist>(CalendarStripHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_on_custom_colors</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gacd479537bb794bc2cc1f07b4db3fb830</anchor>
      <arglist>(CustomColorsHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_set_custom_colors_provider</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf7a398e20625029f2e376405e9132660</anchor>
      <arglist>(CustomColorsProvider cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_add_inbox_complete</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga502ebf1b6d9c87b77f5f708cd7424f86</anchor>
      <arglist>(InboxCompleteHandler cb)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_open</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gab954f122b1dd5b44dfd5bda314c53831</anchor>
      <arglist>(uint32_t inbox_size)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_weather</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaf552756e4da1e1818775bb984bdd36c0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_stock</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac7dbcd76bf92e5bbf684d2c9849b5ebf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>appmessage_request_calendar</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gac18380f0c5fdc613452b569ef4d88c35</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_busy</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga2c94fc09107a6527a82ec145fd784a9d</anchor>
      <arglist>(const OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_pending</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga6f6fa750435ac4704bb55298be9b7e27</anchor>
      <arglist>(const OutboxQueue *outbox, OutboxKind kind)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>outbox_push</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga219aad77cbe9215d9c3cd1aacd33a457</anchor>
      <arglist>(OutboxQueue *outbox, OutboxKind kind, int retries)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_pop_front</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gaa5025f0a1f281cb9b6b3f74c2a7f7481</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_take_head</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga821df0e180a04bb345ca338f3d6829e4</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static OutboxJob</type>
      <name>outbox_release</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>gabf4958a2b2c2b9310e9c3dde7d76e18d</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_hold_failed</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga1a93146eec16ce495449829a38274d31</anchor>
      <arglist>(OutboxQueue *outbox, OutboxJob job)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static int</type>
      <name>outbox_retry_pass</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga66fb285ede9868f85fbaa10fe36ebbba</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static void</type>
      <name>outbox_clear</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga7a65d4b95956b231936a0de61759fca9</anchor>
      <arglist>(OutboxQueue *outbox)</arglist>
    </member>
    <member kind="function">
      <type>int32_t</type>
      <name>tuple_int_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga2efbc3a4f1c2f061db644fae33148a15</anchor>
      <arglist>(const Tuple *tuple, int32_t fallback)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>tuple_str_or</name>
      <anchorfile>group__lib__io.html</anchorfile>
      <anchor>ga86dd1adef099205e5eb8c1d52b03ce96</anchor>
      <arglist>(const Tuple *tuple, const char *fallback)</arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_stores</name>
    <title>Stores</title>
    <filename>group__lib__stores.html</filename>
    <file path="src/c/pebble/io/stores/">calendar_store.c</file>
    <file path="src/c/pebble/io/stores/">calendar_store.h</file>
    <file path="src/c/pebble/io/stores/">health_store.c</file>
    <file path="src/c/pebble/io/stores/">health_store.h</file>
    <file path="src/c/pebble/io/stores/">location_store.c</file>
    <file path="src/c/pebble/io/stores/">location_store.h</file>
    <file path="src/c/pebble/io/stores/">stock_store.c</file>
    <file path="src/c/pebble/io/stores/">stock_store.h</file>
    <file path="src/c/pebble/io/stores/">store_cadence.c</file>
    <file path="src/c/pebble/io/stores/">store_cadence.h</file>
    <file path="src/c/pebble/io/stores/">store_fetch.c</file>
    <file path="src/c/pebble/io/stores/">store_fetch.h</file>
    <file path="src/c/pebble/io/stores/">store_persist.c</file>
    <file path="src/c/pebble/io/stores/">store_persist.h</file>
    <file path="src/c/pebble/io/stores/">store_poll.c</file>
    <file path="src/c/pebble/io/stores/">store_poll.h</file>
    <file path="src/c/pebble/io/stores/">store_sum.c</file>
    <file path="src/c/pebble/io/stores/">store_sum.h</file>
    <file path="src/c/pebble/io/stores/">system_store.c</file>
    <file path="src/c/pebble/io/stores/">system_store.h</file>
    <file path="src/c/pebble/io/stores/">time_store.c</file>
    <file path="src/c/pebble/io/stores/">time_store.h</file>
    <file path="src/c/pebble/io/stores/">weather_store.c</file>
    <file path="src/c/pebble/io/stores/">weather_store.h</file>
    <class kind="struct">CalendarConfig</class>
    <class kind="struct">CalendarSeed</class>
    <class kind="struct">HealthConfig</class>
    <class kind="struct">HealthSeed</class>
    <class kind="struct">LocationConfig</class>
    <class kind="struct">LocationSeed</class>
    <class kind="struct">StockConfig</class>
    <class kind="struct">StockSeed</class>
    <class kind="struct">StoreFetch</class>
    <class kind="struct">StorePoll</class>
    <class kind="struct">SystemConfig</class>
    <class kind="struct">SystemSeed</class>
    <class kind="struct">TimeConfig</class>
    <class kind="struct">WeatherConfig</class>
    <class kind="struct">WeatherSeed</class>
    <class kind="struct">[struct].s_state</class>
    <member kind="define">
      <type>#define</type>
      <name>STORE_CADENCE_MAX</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga60f6d598b8ff59f299aa4ded2e48b695</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_READING_SIZE</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga50fd63663c9be7ae50341d6862e04150</anchor>
      <arglist>(state, stamp)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>WEATHER_SEED_EMPTY</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gae0d84f2727ec304e5376009e5f7dcd18</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>void(*)</type>
      <name>BtVibePolicy</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga96c4cb6d425115a65f787896786b232f</anchor>
      <arglist>(bool connected)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad9d0b53b9a4f189dd3a591801401ec35</anchor>
      <arglist>(CalendarConfig cfg, const CalendarSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gade1a2a8d19355c64e027ed3b89479f0e</anchor>
      <arglist>(CalendarConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>calendar_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga83e9c3f206ad5ced9e3d6c50cb0fa96b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const CalendarStrip *</type>
      <name>calendar_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabbe75636f8fd3bbc25e5907b8b703478</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const CalendarEvent *</type>
      <name>calendar_store_event</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3b326a92ec3b996da7b21ffe32934106</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>calendar_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga53bd3d81fba50d07ccee2739d53c22ae</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>health_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadb98993f8a5d2ea3ac0b99effab8b393</anchor>
      <arglist>(HealthConfig cfg, const HealthSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>health_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3d23a155e70dad9fd2ac23f2ec39775c</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>uint8_t *</type>
      <name>health_store_hr_history</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2db6e554fac24c95cdb2823cdb18bef0</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const uint16_t *</type>
      <name>health_store_step_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga34ce959b4e7f9802230c7e1319b3bf28</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_step_hours</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7f6eb32c1ad9a2a9ffa41d13dc507204</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_hr</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaebe919776f17167171641aeae6310796</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_steps</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga38cd6bed400162ebab1a2284484c4445</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_calories</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gabe7efc42c8679e55ecb7804fb17895ec</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_sleep_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaae218db51d5633570091919ba1e07ab4</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_active_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga1712c5d7441e81d5b804d19e112bdb3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>health_store_distance_m</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga82d8e5fff446bf3a7e20228c8cb49df9</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>location_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2027df7324b501eba2a93b048974f50c</anchor>
      <arglist>(LocationConfig cfg, const LocationSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>location_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga59425f07e9de612bbcaae2dd0bcf266f</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lat</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaca52fe40f16b8699445cc2a3d3df0bf9</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>location_store_lon</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga84432464d20d131431730d966053fc52</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0631f8c075d9a6c76e2f6f386f3970</anchor>
      <arglist>(StockConfig cfg, const StockSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf5880da69fee6e18843b989032e67836</anchor>
      <arglist>(StockConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>stock_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga286d1850c71a9b7e3e62be5b92ea916a</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const StockStrip *</type>
      <name>stock_store_strip</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4b56f050715401cfdd8a57bd1063cbe7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const StockSlot *</type>
      <name>stock_store_slot</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga44242789115b6e0615358ddc114a24dc</anchor>
      <arglist>(uint8_t index)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>stock_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5074e747148193546c869652ea01584d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_register</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc0f8176e42cbe69fd30b1a363ca4794</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_cadence_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga10c78a131269bea0afd102549a41083c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_fire</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5f892bf9d70a4f44dbdd186ce95eaf12</anchor>
      <arglist>(void *data)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_stop</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga01742f5fe91b9b4c089f9540e5c6a10f</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_arm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad33c4412c02b7068286958a4ff9d39c0</anchor>
      <arglist>(StoreFetch *fetch)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gae24dbc83a69a2c585fc08c07f2d27091</anchor>
      <arglist>(StoreFetch *fetch, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_start</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gab0e39f35c438d27685e759973a271790</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>store_fetch_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3baeb7249495a37edb88ef463ba8d904</anchor>
      <arglist>(StoreFetch *fetch, int poll_min, bool live, time_t now, bool empty)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_restore</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga286178630dd827b7d2e677742541e280</anchor>
      <arglist>(uint32_t key, void *state, size_t size, uint8_t tag)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_save</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga814b2c13673684e3684ff4ed7beec6eb</anchor>
      <arglist>(uint32_t key, void *state, size_t size, uint8_t tag)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_save_changed</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga26072e6c901d3d7455c93261276e6922</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_restore_reading</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gacfb278bcfc9c6dbc28c5728a3b68e277</anchor>
      <arglist>(uint32_t key, void *state, size_t size, size_t reading_size, uint8_t tag, uint32_t *saved_sum)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static time_t</type>
      <name>store_poll_next</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaee79556bd3009dd1478b61913e5368d4</anchor>
      <arglist>(int poll_min, time_t now)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_poll_due</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga997e6ccf70b96c79e2500b83af6e54dc</anchor>
      <arglist>(int poll_min, time_t *next, time_t now)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static bool</type>
      <name>store_poll_reconnect_due</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga8bf76bddf8844add6cd6e7c0684b8ee0</anchor>
      <arglist>(int age_s, int poll_min)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_set</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga30b8b33c3204c012230afe0eb9e8d594</anchor>
      <arglist>(StorePoll *poll, int poll_min, bool live, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>store_poll_turn</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga576c21d8f643934d22918c3fb2cbeeef</anchor>
      <arglist>(StorePoll *poll, time_t now)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>store_sum</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga51f7004ec5d8471cdf108a9ee46bb77b</anchor>
      <arglist>(const void *bytes, size_t size)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga98c417e24d8488baa2bb33e39155a3e7</anchor>
      <arglist>(SystemConfig cfg, const SystemSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_deinit</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga8d12e20cd8e402fc7c7abbfcd7454f3c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa56e12f48eddf86b1533059128765d2e</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>system_store_on_reconnect</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa29b6900ac64eda8dfb6dd8918ef531b</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>system_store_battery</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0a7b3e80e633a5f021929a1f3751260f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_charging</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga93e1005fb36a193016d69e406ef58f16</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_bluetooth</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2ebbd6eb46dfd92742b55a346d164961</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>system_store_next_alarm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga323c6c5d1989296b9618d94e94f92daa</anchor>
      <arglist>(time_t *out)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga000282fef3aa31a69a8038abb49fa576</anchor>
      <arglist>(TimeConfig cfg, const struct tm *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9c2eacc43d552852d63185bd4ca16379</anchor>
      <arglist>(TimeConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>time_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga03d7e9b1823247fa9d5a6ead85797571</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>const struct tm *</type>
      <name>time_store_tm</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadc9650a7506ac75294df48a7a8deadcd</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_init</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga49a92d34f22c2bb81f54084b02215709</anchor>
      <arglist>(WeatherConfig cfg, const WeatherSeed *seed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_reconfigure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2af1e0b42fd91db04b7bf0e358f80a85</anchor>
      <arglist>(WeatherConfig cfg)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>weather_store_subscribe</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga40fd78d1cab03532c37b131b1c2a9111</anchor>
      <arglist>(void(*cb)(void))</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2cd48126740a404ee6893890c5abf288</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga2b52199ca0e311c968b7f831305acd62</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_cond_label</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gad57eba8aa9a6f59644fedafcac7a3bab</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_humidity</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaec0de378ffe3adbadab18b877c3e214c</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_wind_kmh</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06fe793fd4c59b655856f6f1454e66a1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>weather_store_wind_dir</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga21865e60abf090e923d95f74e4e5e3b2</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunrise</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gadcce3fc2dbdf6a3ccd751a70ef171adf</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_sunset</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga613a6718a67c620b3c4623cbbfc3d84e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_feels_like</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga06cf30734c71d28b90e5b660ee75bc9d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_pressure</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gac167df267d9204941ae5ef9541074edc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_dew_point</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga4780ec893b0d2cb94e17ab85c78e377d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_uv</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga839bf5c5187f067697de69f79f025b3f</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_max</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga9521fad2bb38f644e02c9c3ac8547d4b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_temp_min</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga3ad694d30ad387bd9a9c1db451cc9c2d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_precip_chance</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga04d4ed2abc57cd51459c6913b2d77e1d</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherHourly *</type>
      <name>weather_store_forecast_hourly</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaba5bc2a406811b7f6d4b6df181f620d7</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>const WeatherDaily *</type>
      <name>weather_store_forecast_daily</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga0610dff5f72df6fa9f4312a73e6d96de</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>weather_store_age_s</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga7856768b2bde2cf55422b2c3b5ea3b4e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_WEATHER</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaf7f92da5799b3fc95c172f84287e6867</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_STOCK</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga5b35a6941ad6bb200a944b38ae9fa676</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_CALENDAR</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga71057ac435b7b29a882b011053659d86</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_HEALTH</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>ga31737569cb65fc760932f244727a568d</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>STORE_TAG_LOCATION</name>
      <anchorfile>group__lib__stores.html</anchorfile>
      <anchor>gaa19bf75ee3cb87a3a31a97238f4dcf73</anchor>
      <arglist></arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_settings</name>
    <title>Settings</title>
    <filename>group__lib__settings.html</filename>
    <file path="src/c/pebble/system/settings/">setting_values.h</file>
    <file path="src/c/pebble/system/settings/">settings.c</file>
    <file path="src/c/pebble/system/settings/">settings.h</file>
    <file path="src/c/pebble/system/settings/">settings_catalog.h</file>
    <class kind="struct">SettingField</class>
    <class kind="struct">SettingsSchema</class>
    <class kind="struct">SettingsInbound</class>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_TEMPERATURE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaeeceac8a6d66376b0fbb3b495e245a8c</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_DATE_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga25c13546f27ddad133d5d8cbe348d84a</anchor>
      <arglist>(off, dflt)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_THEME</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga0d7b14fdb5d548d8571799ed3b9f2325</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_STEPS_MODE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga019f574fbd717df373aa4f6a2fa623f7</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_DISTANCE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gace7412b22cb2958264322350c07c65cd</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_TIME_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga51c9800159631adbf77eafe13eeb3d34</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga5f8c5ebca9a4cae4d21ee7a6b8280fb8</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_QUIET_TIME_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga85914fbaf222c55ef9c16f52c16fceb0</anchor>
      <arglist>(off)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_VIBE_CONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga3b7c73968d189a076bb660a5e654471b</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BLUETOOTH_VIBE_DISCONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga1f3cdcddc8652b8560d494e04b4f4ae7</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_HOURLY_VIBE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga841203aee583d7a932bc02a1f4517847</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>KNOWN_BATTERY_DISPLAY</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8060d99e4e1951c1e98e0e3c49e77db3</anchor>
      <arglist>(off, count)</arglist>
    </member>
    <member kind="typedef">
      <type>struct SettingsSchema</type>
      <name>SettingsSchema</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga4c71229864f5dc765a8b70c2c971fb99</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>TimeFormat</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga25de3b313f6a766c08b5af9f3cac864d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_SYSTEM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da63335a13eb734c3302caeeb5b9d74485</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_12H</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864daed991c52c4fa5f4569d7213de1fa7763</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_24H</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864daf1d5570fd3277ed40a3b0378cf1a2f79</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_BEATS</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da7cda0e5d3eeee8e6f82b6ae89cf120d5</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_12H_NO_LEAD</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da9522d658e373ea077be0a0edfaf58468</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>TIME_FORMAT_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga25de3b313f6a766c08b5af9f3cac864da4ffd6b05b8739bfa9443b3b08aaa447f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>StepsMode</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga6e6066815d52058ba7571050020ca960</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_STEPS</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960aa29671c6c7e06670eb55a4a4f062e7fa</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_MILES</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960a062656b30d579c0240fb0328b9b95fbe</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_KM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960a5bfc8f1e5575d9f15901d28ed9a82edf</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>STEPS_MODE_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga6e6066815d52058ba7571050020ca960ab5ce5ab146d3c8bd00eeb2c933937928</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>DistanceUnit</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga4c67a7b952f3804e2bd056cf95c4161a</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_KM</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aa9f93d9e27b923402d6c730122896530f</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_MILES</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aae026af054f0e10b7ae1896cf47ab26f3</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DISTANCE_UNIT_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga4c67a7b952f3804e2bd056cf95c4161aaca24a90c5e04e8f18619665261912ae9</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>VibeChoice</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga7b8aec224cacf74446d899e5eaab0819</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_NONE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819acea2b08ae811c660ece561bd9ee6075a</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_SHORT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819a81c74b9772cdf17b4c1ba152a188f052</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_LONG</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819acebdbaa12797350abb41b9484f67de79</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_DOUBLE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819ad39a0395f1a3f01c96f7ea467c9bbc26</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VIBE_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga7b8aec224cacf74446d899e5eaab0819a1415e32b1347a563573ba9ce377f4856</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>BatteryDisplay</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaaec2354b2ba9c2f927d81fc5daf6d24d</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_BOTH</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24da5e582ca0827de8a4e8fde4b51531e8c2</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24da932a7cf8db1d4e388d04275565b50357</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_PERCENT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24dadb70a1bb92d4ea05d4d1ddf4b3f230d7</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>BATTERY_DISPLAY_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ggaaec2354b2ba9c2f927d81fc5daf6d24daa60c922484f7d2a88e9c7d42a8af9fb0</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>SettingId</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga5b6861430c47031f602e2af972953f53</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_TEMPERATURE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a1019e4e2d28c1701a2d2f31b733bb188</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_DATE_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53af80c4cb917a7de898f4024852a77cf75</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_THEME</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a71f897633057f6efea0f87bd0ffaa5a2</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_STEPS_MODE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53af493313f74aa611a4726b8beebe09ea4</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_DISTANCE_UNIT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53acb4709fec470f37af97855bcffbf6e19</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_TIME_FORMAT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aa11a12d9cbe1d2e83e9ebdbb799582cf</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53ac6fc547727f28528f43d6e9dafa34315</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_QUIET_TIME_ICON</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a72f06dd4e0dfaf0b724a5b3188e2c5bd</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_VIBE_CONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a4134cdbe739d3b5cfbaf90fa65312548</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BLUETOOTH_VIBE_DISCONNECT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aa7a8c945d5c0cc9cf86a295aa468dfc0</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_HOURLY_VIBE</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a1cc0cdb25c54b97706636d1b0019e895</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BATTERY_DISPLAY</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a55fd50c70be3d5855ed7ae3f9a158276</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_HEADER_FONT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53aafd1da9c39c0d57c730c1aadea997fb9</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_COUNT</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga5b6861430c47031f602e2af972953f53a426d509db457c0ed090c5cbe59517a33</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumeration">
      <type></type>
      <name>SettingType</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8dfa1a122b59a38c38cc2824be723338</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_BOOL</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338ae6502b94eb9c2d9511fef893f08cf3be</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_ENUM_U8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338a75134673575de8e48aec0067e543b066</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_CSTRING</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338af6eeeb0762facb761e45e86fea90b345</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>SETTING_COLOR</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gga8dfa1a122b59a38c38cc2824be723338a9a64de1bc8a9ea6b2eb8ad77c291fdf3</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_init</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gabf78fb93dcb30f9c8f17cc2eaa9a934e</anchor>
      <arglist>(const SettingsSchema *schema)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_was_fresh</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga40b5dc5d02dfa2e8a630782dc5be7263</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_save</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab9d20e3758e874e18f045827a5cd29b3</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_mark_restored</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga311ba161873a4026937acc17c57525cc</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga3751b197b3c6a12637ebdf7ebc0ea997</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>settings_str</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gab048a393e0f36aa1df969db0a34db046</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>settings_set_u8</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>gaca6beaa8ac8e3de5499b406ebab187af</anchor>
      <arglist>(SettingId id, uint8_t value)</arglist>
    </member>
    <member kind="function">
      <type>uint8_t</type>
      <name>settings_enum_count</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga7f6e82a36168e1d570748a8c18d0a30b</anchor>
      <arglist>(SettingId id)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>settings_serialized_size_max</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga281a4f818f93bf883410d0222e21713b</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>settings_serialize</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga8a25e0c1aea6e4cb033cefa62a590458</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
    <member kind="function">
      <type>SettingsInbound</type>
      <name>settings_apply_inbox</name>
      <anchorfile>group__lib__settings.html</anchorfile>
      <anchor>ga226c66180fb376a5888b279eca034417</anchor>
      <arglist>(DictionaryIterator *iter)</arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_system</name>
    <title>System Bits</title>
    <filename>group__lib__system.html</filename>
    <file path="src/c/pebble/system/units/">units.c</file>
    <file path="src/c/pebble/system/units/">units.h</file>
    <file path="src/c/pebble/system/vibe/">vibe.c</file>
    <file path="src/c/pebble/system/vibe/">vibe.h</file>
    <member kind="enumeration">
      <type></type>
      <name>VibePulse</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>gabbe12c91a0e3541c91618e6765204e19</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseShort</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19ae9aaea4d3226665ad0772d40537a1319</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseLong</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19a362ca2d17606221941dfa679ddb9ecbe</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>VibePulseDouble</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ggabbe12c91a0e3541c91618e6765204e19ae2653abdfc98405084bd8d0da715af1c</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>int</type>
      <name>units_swatch_beats</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6abe1f5f8efd60ddf21617822f0f6fd6</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>units_ms_until_next_beat</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga85d3000cf6b4ab6360ff3df4e97add8e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga94c81ab17362b08d64e0b2497730bbd5</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>units_format_distance_value</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga4132ffc49e378387d53b1a1171fd2b05</anchor>
      <arglist>(char *buffer, size_t size, int meters, bool miles)</arglist>
    </member>
    <member kind="function">
      <type>const char *</type>
      <name>units_distance_unit</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga6c4edc61ad14869972212cf59a4f7d47</anchor>
      <arglist>(bool miles)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_pulse</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga06fdc71bb88f3abae23d9c6ac8ef7c8e</anchor>
      <arglist>(VibePulse pulse)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_custom</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga005b71470c6beaa166cd9cc7c5cf10b1</anchor>
      <arglist>(const uint32_t *durations, uint32_t num_segments)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_choice</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga68e3aacc6c4efcb6b2827627e09da299</anchor>
      <arglist>(uint8_t choice)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>vibe_bt_transition</name>
      <anchorfile>group__lib__system.html</anchorfile>
      <anchor>ga9b510de5a24f5136dfb470f5aa6aafd5</anchor>
      <arglist>(bool connected)</arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_ui</name>
    <title>UI</title>
    <filename>group__lib__ui.html</filename>
    <file path="src/c/pebble/ui/engine/">engine.c</file>
    <file path="src/c/pebble/ui/engine/">engine.h</file>
    <file path="src/c/pebble/ui/">fonts.c</file>
    <file path="src/c/pebble/ui/">fonts.h</file>
    <file path="src/c/pebble/ui/">icon_cache.c</file>
    <file path="src/c/pebble/ui/">icon_cache.h</file>
    <file path="src/c/pebble/ui/">readouts.c</file>
    <file path="src/c/pebble/ui/">readouts.h</file>
    <file path="src/c/pebble/ui/weather/">icons.c</file>
    <file path="src/c/pebble/ui/weather/">icons.h</file>
    <file path="src/c/pebble/ui/weather/">icons_table.g.h</file>
    <file path="src/c/pebble/ui/">zone.c</file>
    <file path="src/c/pebble/ui/">zone.h</file>
    <class kind="struct">EngineSlot</class>
    <class kind="struct">IconMargins</class>
    <class kind="struct">Zone</class>
    <member kind="define">
      <type>#define</type>
      <name>ENGINE_MAX_SLOTS</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga36e1ce7a039108d509b546091b2f81ea</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>FONT_SLOTS_MAX</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga4ca1872518ba74eea31ab554588e7398</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>ICON_AUTOTRIM</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga0218b6d868d6c02e798e1f43e04a8d28</anchor>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>ICON_TRIM_LOG</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gacd235799baa707d5f8b99169732c0625</anchor>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>uint8_t(*)</type>
      <name>EngineBuild</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gafb4e0c889ad43fc740ce8968464eead4</anchor>
      <arglist>(EngineSlot *out, uint8_t max, GRect bounds)</arglist>
    </member>
    <member kind="typedef">
      <type>uint8_t</type>
      <name>FontId</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga8cad323339ccb30f88dae519c4e198f5</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_init</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga80e9c91268f57dc6bd9233afc9d7a19f</anchor>
      <arglist>(Window *window, EngineBuild build)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_deinit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga371c44d7e8c48ce708a69bfd413a2a0e</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_rebuild</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga878b25483298cd1601b2191e7eb9da87</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaec392c631ca5f1420f4ad730f2c0c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>engine_mark_dirty_tags</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga8cfbff710717e1257d8545775d7171b0</anchor>
      <arglist>(uint32_t changed)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_register</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad49c536818ff15a0e7535e258fbdd59b</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_register_system</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac0a1fd4baa979be69b65a646fd457ad8</anchor>
      <arglist>(FontId id, GFont handle)</arglist>
    </member>
    <member kind="function">
      <type>GFont</type>
      <name>fonts_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7a313b71a1524d1183f9163522710472</anchor>
      <arglist>(FontId id)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>fonts_unload_all</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab7fb11d15d23d2ef37c4baa9db129ee1</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>GBitmap *</type>
      <name>icon_get</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7968af6a0c5eadec10e501121ec97760</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>GSize</type>
      <name>icon_size</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa15abf7931b6be2b608974a6c263c56e</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga2040f8e16081e8b48289641c6914c73f</anchor>
      <arglist>(uint32_t res)</arglist>
    </member>
    <member kind="function">
      <type>IconMargins</type>
      <name>icon_margins_of</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gabad4c43378e5bd3628da4131b2343ad5</anchor>
      <arglist>(GBitmap *bmp)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_tint</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gafa86e8ce9e0e424a0bb3b08e7dd3c04e</anchor>
      <arglist>(GBitmap *bmp, GColor color)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icon_align_trim</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab859f1d276edd74cad316c2b811d79cc</anchor>
      <arglist>(GAlign align, IconMargins margins, int *trim_dx, int *trim_dy)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>icons_cleanup</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga3b5138fb45e8c6ce2ed2648318eefdab</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_time</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5f1ce126b5f8ddfb48e78d1077355883</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_meridiem</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gad7314f0630f01d77249d12b3f5018d20</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_date</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga27e66e5fb5efa50e5cd3a641ca95f3e1</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>bool</type>
      <name>readout_date_shows_beats</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gac815591cccd1783227eb1a656212c8c5</anchor>
      <arglist>(void)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_hr</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gab74d674a3402d0c3ccb145f54ee4d5dc</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_steps</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga46b62b70722c1a8885049b5dd237aa7e</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_temp</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaee4e7d275341c91bdbae7a5adc7ddc09</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_weather_cond</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga5d4d51464278e6e297e35ecf92b88666</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lat</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gaa2fe71cbe1755aae8977cad2d17e71ed</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>readout_lon</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>gacea2f8a4dcf1bff5344807e02a4842aa</anchor>
      <arglist>(char *out, size_t n)</arglist>
    </member>
    <member kind="function">
      <type>uint32_t</type>
      <name>wx_resource_for</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga9a50b66845b71a795a1739d45b510875</anchor>
      <arglist>(const char *condition)</arglist>
    </member>
    <member kind="function" static="yes">
      <type>static uint32_t</type>
      <name>wx_resource_for_table</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga7bdf911d493eb75876b96a13b80a6e41</anchor>
      <arglist>(const char *condition)</arglist>
    </member>
    <member kind="function">
      <type>TextLayer *</type>
      <name>zone_make_layer</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga43295bc3eba00fc026a19f6533e2533b</anchor>
      <arglist>(Layer *parent, const Zone *zone)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>zone_set_text_fit</name>
      <anchorfile>group__lib__ui.html</anchorfile>
      <anchor>ga9caa8b2be1e2c9459049c7e6a37d8f7b</anchor>
      <arglist>(TextLayer *layer, const Zone *zone, const char *text)</arglist>
    </member>
  </compound>
  <compound kind="group">
    <name>lib_plugins</name>
    <title>Plugins</title>
    <filename>group__lib__plugins.html</filename>
    <subgroup>lib_dev</subgroup>
  </compound>
  <compound kind="group">
    <name>lib_dev</name>
    <title>Dev Harness</title>
    <filename>group__lib__dev.html</filename>
    <file path="src/plugins/dev/c/dev/">dev_walk.c</file>
    <file path="src/plugins/dev/c/dev/">dev_walk.h</file>
    <class kind="struct">[struct].s_fixed</class>
    <member kind="enumeration">
      <type></type>
      <name>DevWalkMode</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>gabd7169bdf3c69ae6ffe751b975f1fadd</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DEV_WALK_NONE</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ggabd7169bdf3c69ae6ffe751b975f1faddae5c1f92f3e0ce1d4f302715625f3d2ca</anchor>
      <arglist></arglist>
    </member>
    <member kind="enumvalue">
      <name>DEV_WALK_THEMES</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ggabd7169bdf3c69ae6ffe751b975f1faddac0d36779d185db570fe780315e64261d</anchor>
      <arglist></arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_seed_stores</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>gad7d36031f9102cac1d91f9d66079d9ed</anchor>
      <arglist>(int hour, int min)</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_init</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga881065800617954a0fd094063774f0d9</anchor>
      <arglist>(DevWalkMode mode, void(*apply_theme)(void))</arglist>
    </member>
    <member kind="function">
      <type>void</type>
      <name>dev_walk_deinit</name>
      <anchorfile>group__lib__dev.html</anchorfile>
      <anchor>ga1ff4ca8046b48b20d4d60258901384c1</anchor>
      <arglist>(void)</arglist>
    </member>
  </compound>
  <compound kind="page">
    <name>index</name>
    <title>Device API</title>
    <filename>index.html</filename>
  </compound>
</tagfile>
