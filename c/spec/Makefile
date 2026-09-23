# Host unit tests for the pure lib/c code. Run under WSL or any Linux with gcc.
# Each *.spec.c anywhere under lib/c is a standalone Unity program. `make` builds
# and runs them all and returns non-zero if any test fails, so it doubles as the
# CI gate. The spec files never reach the watch: waf_helpers.py drops them from the
# firmware glob (excl **/*.spec.c and spec/**).
#
# Most of these cover lib/c/core: date and moon and beats maths, number and text
# formatting, unit conversion. All of it plain arithmetic that needs no watch, which
# is why the suite runs in about a second. A unit under lib/c/pebble that decides
# something on its own joins them, such as the outbox queue and the store poll, and
# host/pebble.h stands in for the handful of SDK names those need. Anything that
# would need persist, a dictionary or AppMessage faked is left to the device.

CC      ?= cc
# -Wno-unused-parameter keeps the SDK callback signatures (void *data and the like) quiet
# -fwrapv makes a signed overflow wrap rather than be undefined, so -O2 cannot quietly hide an
# overflow a spec is there to catch
CFLAGS  ?= -std=c11 -Wall -Wextra -Wno-unused-parameter -fwrapv -O2
# host/ holds the stub pebble.h that lets the pure lib/c/pebble sources compile off the watch
INCLUDES = -I../core -I../pebble -Ihost -Iunity

BUILD = build
UNITY = unity/unity.c

# every pure core source, minus the spec files themselves
CORE_SRC = $(shell find ../core -name '*.c' ! -name '*.spec.c')

# every colocated spec anywhere under lib/c (../ from here is lib/c)
SPECS = $(shell find .. -name '*.spec.c')

# a coverage build runs the same specs with no optimizing, so a line marked as run really ran
# the sources are named relative to this folder, and gcov later runs from somewhere else, so
# -fprofile-abs-path records each one by its full path
COVERAGE_BUILD = $(BUILD)/coverage
COVERAGE_OUT  ?= ../../docs/site/dist/coverage/c
COVERAGE_FLAGS = $(filter-out -O%,$(CFLAGS)) -O0 -g --coverage -fprofile-abs-path

.PHONY: test coverage clean
.DEFAULT_GOAL := test

# compile each spec fresh, then run it right away. every spec gets the whole of core, plus its own
# sibling source when it has one outside core (a header-only unit has none, and needs none)
test:
	@mkdir -p $(BUILD)
	@fail=0; \
	for spec in $(SPECS); do \
	  name=$$(basename $$spec .spec.c); \
	  bin=$(BUILD)/$$name; \
	  sibling=$${spec%.spec.c}.c; \
	  case " $(CORE_SRC) " in *" $$sibling "*) sibling="";; esac; \
	  [ -n "$$sibling" ] && [ -f "$$sibling" ] || sibling=""; \
	  echo "== $$spec =="; \
	  $(CC) $(CFLAGS) $(INCLUDES) $$spec $$sibling $(CORE_SRC) $(UNITY) -o $$bin || { fail=1; continue; }; \
	  $$bin || fail=1; \
	done; \
	exit $$fail

# runs the suite as a coverage build, then has gcovr write the report the docs site publishes
# a failing spec stops here before gcovr runs, so a red suite never publishes a report
coverage:
	@rm -rf $(COVERAGE_BUILD)
	@mkdir -p $(COVERAGE_OUT)
	@$(MAKE) --no-print-directory test BUILD=$(COVERAGE_BUILD) CFLAGS="$(COVERAGE_FLAGS)"
	gcovr --root ../.. --object-directory $(COVERAGE_BUILD) \
	  --filter ../core/ --filter ../pebble/ --exclude '.*\.spec\.c$$' \
	  --html-nested $(COVERAGE_OUT)/index.html --html-title "Host C Specs" \
	  --json-summary $(COVERAGE_OUT)/summary.json

clean:
	rm -rf $(BUILD)
