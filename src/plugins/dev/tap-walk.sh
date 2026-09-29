#!/usr/bin/env bash
#
# tap-walk.sh: screenshot every UNIQUE state of the dev tap-walk.
#
# With a DEV_TAP_WALK_* switch on (see the face's src/c/dev/dev.h) each accel tap steps the face
# to the next module/appearance. This loops screenshot -> emu-tap -> screenshot and
# stops once a shot matches the very first one (the walk has wrapped back to start).
#
# Some taps render identically to a shot we already have (e.g. on a standard panel
# the borderless / no-header / data-only passes all look the same), so we dedupe as
# we go: a shot is only saved when its sha256 is one we haven't seen yet.
#
# Because DEV_FORCE_TIME pins the clock, the same state renders byte-identical, so
# sha256 is a reliable identity + "back to start" signal.
#
# Run from WSL, from the unit that holds the face, through paf or by hand:
#   paf tool ridgeline tap-walk
#   lib/plugins/dev/tap-walk.sh ridgeline
#
# The face comes first and names the build sandbox too. A face that ships several targets
# builds each in a sandbox of its own (gridlock-face, gridlock-app), so --target picks one:
#   lib/plugins/dev/tap-walk.sh gridlock --target=gridlock-face
#
# Assumes the target is already built and installed on the emery emulator. Pass
# --install to build + install first.

set -euo pipefail

EMULATOR="emery"
TARGET=""           # the sandbox under targets/, e.g. ridgeline or gridlock-face
FACE=""             # the face, which build.sh builds and which names the sandbox by default
OUT_DIR=".tmp/tap-walk-shots"   # scratch output, gitignored via .tmp
SETTLE=0.9          # seconds to let the firmware redraw after a tap
MAX_TAPS=200        # hard stop so we never loop forever
DO_INSTALL=0

for arg in "$@"; do
    case "$arg" in
        --install) DO_INSTALL=1 ;;
        --emulator=*) EMULATOR="${arg#*=}" ;;
        --out=*) OUT_DIR="${arg#*=}" ;;
        --target=*) TARGET="${arg#*=}" ;;
        -h|--help)
            grep '^#' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        -*) echo "unknown arg: $arg" >&2; exit 1 ;;
        *)
            if [[ -n "$FACE" ]]; then
                echo "unknown arg: $arg" >&2
                exit 1
            fi
            FACE="$arg"
            ;;
    esac
done

if [[ -z "$FACE" ]]; then
    echo "no face given. pass it first, e.g. tap-walk.sh ridgeline, or tap-walk.sh gridlock --target=gridlock-face" >&2
    exit 1
fi

# the face names the sandbox too, unless --target picks one of a face's several. the targets come
# from the lookup the build itself uses, so a face that ships several is asked which one whether or
# not it has been built yet
FRAMEWORK="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -z "$TARGET" ]]; then
    # the lookup runs on its own first, since a failure inside the read below would go unseen
    if ! LISTED="$(node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$FRAMEWORK/tools/manifest/build-manifests.ts" --targets "$FACE")"; then
        echo "could not read the targets for $FACE. check the face's name and its config/pebble.appinfo.json" >&2
        exit 1
    fi
    TARGETS=()
    [[ -n "$LISTED" ]] && mapfile -t TARGETS <<< "$LISTED"
    if (( ${#TARGETS[@]} > 1 )); then
        echo "$FACE ships several targets. pick one with --target, from: ${TARGETS[*]}" >&2
        exit 1
    fi
    TARGET="${TARGETS[0]:-$FACE}"
fi

PBW="targets/$TARGET/build/$TARGET.pbw"

if [[ "$DO_INSTALL" == "1" ]]; then
    # a face that ships several targets builds them all under its own name, so build.sh wants the
    # face while the .pbw is named after the target
    echo ">> building + installing $TARGET on $EMULATOR"
    # this script sits in <framework>/plugins/dev/, so build.sh is two folders up whatever the framework is called
    bash "$FRAMEWORK/build.sh" "$FACE"
    pebble install --emulator "$EMULATOR" "$PBW"
    sleep 2
fi

if [[ ! -f "$PBW" ]]; then
    echo "no build at $PBW. build it first, or pass --install" >&2
    exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

CANDIDATE="$OUT_DIR/.candidate.png"

# grab a screenshot into the candidate file and echo its sha256
grab() {
    pebble screenshot --no-open --emulator "$EMULATOR" "$CANDIDATE" >/dev/null 2>&1
    sha256sum "$CANDIDATE" | cut -d' ' -f1
}

declare -A seen        # sha256 -> 1 for every state we've already saved
unique=0

echo ">> capturing starting state"
first_hash="$(grab)"
mv -f "$CANDIDATE" "$(printf '%s/shot_%03d.png' "$OUT_DIR" "$unique")"
seen["$first_hash"]=1
printf '   shot_%03d  %s  (start)\n' "$unique" "$first_hash"

for tap in $(seq 1 "$MAX_TAPS"); do
    pebble emu-tap --emulator "$EMULATOR" >/dev/null 2>&1
    sleep "$SETTLE"

    hash="$(grab)"

    if [[ "$hash" == "$first_hash" ]]; then
        # wrapped back to the start
        # we're done
        rm -f "$CANDIDATE"
        echo ">> wrapped back to start after $tap taps"
        echo ">> $((unique + 1)) unique states captured in $OUT_DIR/"
        exit 0
    fi

    if [[ -n "${seen[$hash]:-}" ]]; then
        # a tap that renders the same as a state we already have
        # skip it
        rm -f "$CANDIDATE"
        printf '   tap %-3d   %s  (dup, skipped)\n' "$tap" "$hash"
        continue
    fi

    unique=$((unique + 1))
    seen["$hash"]=1
    mv -f "$CANDIDATE" "$(printf '%s/shot_%03d.png' "$OUT_DIR" "$unique")"
    printf '   shot_%03d  %s\n' "$unique" "$hash"
done

echo ">> hit MAX_TAPS ($MAX_TAPS) without wrapping, check DEV_TAP_WALK_MODULES is on" >&2
echo ">> $((unique + 1)) unique states captured in $OUT_DIR/" >&2
exit 1
