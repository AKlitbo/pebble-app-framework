#!/usr/bin/env bash
# Build watchface(s) (.pbw) from source. A face sits at the repo root in a repo of one, or under
# watchfaces/, at the top level or one deeper inside a family folder. Run from WSL.
# Regenerates the manifest from the face's config/pebble.appinfo.json and compiles
# the TypeScript pkjs into targets/<target>/emit/, then runs pebble build in that sandbox.
#   <framework>/build.sh <face>            build a face (e.g. lib/build.sh lcars-stardate)
#   <framework>/build.sh all               build every face in the repo
#   <framework>/build.sh <face> --clean    pebble clean first (needed after a messageKey change)
# Any other args forward to pebble build (e.g. lib/build.sh lcars-stardate --debug).
set -euo pipefail
engine="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node_ts=(node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON)

if [[ $# -lt 1 || "$1" == -* ]]; then
  echo "usage: $0 <face|all> [--clean] [pebble build args...]" >&2
  exit 1
fi
face="$1"
shift

clean=0
args=()
for arg in "$@"; do
  if [[ "$arg" == "--clean" ]]; then
    clean=1
  else
    args+=("$arg")
  fi
done

build_face() {
  local face="$1"

  # a face usually builds one target (the face itself), but can declare several (a watchface
  # and a watchapp from one source). the manifest step writes a sandbox per target and prints
  # where each one sits. a command substitution rather than a pipe, so a failed step stops here
  local listed sandboxes
  listed=$("${node_ts[@]}" "$engine/tools/manifest/build-manifests.ts" "$face")
  mapfile -t sandboxes <<< "$listed"

  # compile the TypeScript pkjs runtime (the face's src/pkjs and the framework's ts/) into each
  # targets/<target>/emit/, the gitignored tree the Pebble bundler reads. the .ts is the
  # source of truth, so this runs before every build
  "${node_ts[@]}" "$engine/tools/pkjs/build-pkjs.ts" "$face"

  for sandbox in "${sandboxes[@]}"; do
    echo "== building $(basename "$sandbox") (face $face) =="
    (
      cd "$sandbox"
      if [[ "$clean" == 1 ]]; then
        pebble clean
      fi
      pebble build ${args[@]+"${args[@]}"}
    )
  done
}

# the faces come from the framework's own lookup, the same one every other tool uses. a command
# substitution rather than a process substitution, since set -e never sees one of those fail and a
# lookup that died would read as a repo with nothing to build
names=$("${node_ts[@]}" "$engine/tools/manifest/build-manifests.ts" --faces)
if [[ -z "$names" ]]; then
  echo "no faces found. A face is a folder holding config/pebble.appinfo.json, at the repo root or under watchfaces/" >&2
  exit 1
fi

if [[ "$face" == "all" ]]; then
  mapfile -t all_faces <<< "$names"
  for name in "${all_faces[@]}"; do
    build_face "$name"
  done
  exit 0
fi

if ! grep -qx -- "$face" <<< "$names"; then
  echo "no such face: $face. The faces in this repo are: $(tr '\n' ' ' <<< "$names")" >&2
  exit 1
fi

build_face "$face"
