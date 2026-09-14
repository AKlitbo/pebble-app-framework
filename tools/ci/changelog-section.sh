#!/usr/bin/env bash
# Pull one version's section out of a face's CHANGELOG.md, for use as GitHub release notes.
#
# The changelogs are Keep a Changelog format, so every release is already written up under a
# "## [X.Y.Z] - YYYY-MM-DD" header. Release notes are that section verbatim. There is no second
# place to keep them in sync.
#
# Also the release gate: an entry still dated "Unreleased" means the changelog was never finished,
# so this exits non-zero rather than publishing a half-written release.
#
# Usage: tools/ci/changelog-section.sh <face> <version> [--date]
#   --date   print the section's release date instead of its body

set -euo pipefail

# helper to print errors to stderr and exit
die() {
  echo "$1" >&2
  exit 1
}

if [[ $# -lt 2 ]]; then
  die "Usage: $0 <face> <version> [--date]"
fi

face="$1"
version="$2"
mode="${3:-body}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# a repo of one keeps its face, and so its changelog, at the root. otherwise the changelog sits in
# the face's folder under watchfaces/
changelog=""
if [[ -f "$here/config/pebble.appinfo.json" ]] && [[ "$(node -p "require(process.argv[1]).name" "$here/config/pebble.appinfo.json")" == "$face" ]]; then
  changelog="$here/CHANGELOG.md"
elif [[ -d "$here/watchfaces" ]]; then
  changelog=$(find "$here/watchfaces" -mindepth 2 -maxdepth 3 -path "*/$face/CHANGELOG.md" | head -1)
fi
where="${changelog#"$here"/}"

[[ -f "$changelog" ]] || die "Error: No changelog for $face"

# "## [1.4.0] - 2026-07-03" -> everything after the " - "
header=$(grep -m1 -F "## [$version]" "$changelog" || true)

[[ -n "$header" ]] || die "Error: No [$version] section in $where"

release_date="${header#*] - }"

if [[ "$release_date" == "Unreleased" ]]; then
  die "Error: $where still has [$version] as Unreleased: date it before releasing"
fi

if [[ "$mode" == "--date" ]]; then
  printf '%s\n' "$release_date"
  exit 0
fi

# print between this version's header and the next "## [" one.
# this single Awk command extracts the section AND trims leading/trailing blank lines.
body=$(awk -v header="## [$version]" '
  index($0, header) == 1 { collecting = 1; next }
  collecting && /^## \[/ { exit }
  collecting {
    if (!NF) {
      held++
    } else {
      if (started) {
        for (i = 0; i < held; i++) print ""
      }
      started = 1
      held = 0
      print
    }
  }
' "$changelog")

if [[ -z "$body" ]]; then
  die "Error: The [$version] section in $where is empty: write it before releasing"
fi

printf '%s\n' "$body"