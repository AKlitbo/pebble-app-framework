#!/usr/bin/env bash
# Build watchface(s) (.pbw) from source. A face sits at the repo root in a repo of one, or under
# watchfaces/, at the top level or one deeper inside a family folder. Run from WSL.
# Regenerates the manifest from the face's config/pebble.appinfo.json and compiles
# the TypeScript pkjs into targets/<target>/emit/, then runs pebble build in that sandbox.
#   <engine>/build.sh <face>            build a face (e.g. lib/build.sh lcars-stardate)
#   <engine>/build.sh all               build every face in the repo
#   <engine>/build.sh <face> --clean    pebble clean first (needed after a messageKey change)
# Any other args forward to pebble build (e.g. lib/build.sh lcars-stardate --debug).
set -euo pipefail
engine="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# the engine is mounted one folder down in the repo of faces, and the faces and build sandboxes live there
here="$(cd "$engine/.." && pwd)"
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

  "${node_ts[@]}" "$engine/tools/manifest/build-manifests.ts" "$face"

  # a face usually builds one target (the face itself), but can declare several (a watchface
  # and a watchapp from one source). the manifest step wrote a sandbox per target. ask it which
  local targets
  targets=$("${node_ts[@]}" "$engine/tools/manifest/build-manifests.ts" --targets "$face")

  for target in $targets; do
    # compile the TypeScript pkjs runtime (the face's src/pkjs and the engine's ts/) into
    # targets/<target>/emit/, the gitignored tree the Pebble bundler reads. the .ts is the
    # source of truth, so this runs before every build
    "${node_ts[@]}" "$engine/tools/pkjs/build-pkjs.ts" "$target" "$face"

    echo "== building $target (face $face) =="
    (
      cd "$here/targets/$target"
      [[ "$clean" == 1 ]] && pebble clean
      pebble build ${args[@]+"${args[@]}"}
    )
  done
}

# the faces come from the engine's own lookup, the same one every other tool uses
face_names() {
  "${node_ts[@]}" "$engine/tools/manifest/build-manifests.ts" --faces
}

if [[ "$face" == "all" ]]; then
  while IFS= read -r name; do
    build_face "$name"
  done < <(face_names)
  exit 0
fi

if ! face_names | grep -qx "$face"; then
  echo "no such face: $face. The faces in this repo are: $(face_names | tr '\n' ' ')" >&2
  exit 1
fi

build_face "$face"
