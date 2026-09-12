#!/usr/bin/env bash
# Build watchface(s) (.pbw) from source. A face sits at the repo root in a repo of one, or under
# watchfaces/, at the top level or one deeper inside a family folder. Run from WSL.
# Regenerates the manifest from the face's config/pebble.appinfo.json and compiles
# the TypeScript pkjs into targets/<face>/emit/, then runs pebble build in that sandbox.
#   lib/build.sh <face>            build a face (e.g. lib/build.sh lcars-stardate)
#   lib/build.sh all               build every face in the repo
#   lib/build.sh <face> --clean    pebble clean first (needed after a messageKey change)
# Any other args forward to pebble build (e.g. lib/build.sh lcars-stardate --debug).
set -euo pipefail
engine="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# the engine is mounted at <workspace>/lib/, and the faces and build sandboxes live in the workspace
here="$(cd "$engine/.." && pwd)"

if [[ $# -lt 1 || "$1" == -* ]]; then
  echo "usage: lib/build.sh <face|all> [--clean] [pebble build args...]" >&2
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

  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$engine/tools/manifest/build-manifests.ts" "$face"

  # a face usually builds one target (the face itself), but can declare several (a watchface
  # and a watchapp from one source). the manifest step wrote a sandbox per target; ask it which
  local targets
  targets=$(node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$engine/tools/manifest/build-manifests.ts" --targets "$face")

  for target in $targets; do
    # compile the TypeScript pkjs runtime (the face's src/pkjs + lib/ts) into
    # targets/<target>/emit/, the gitignored tree the Pebble bundler reads. the .ts is the
    # source of truth, so this runs before every build
    (cd "$here" && npm run build:pkjs -- "$target" "$face")

    echo "== building $target (face $face) =="
    (
      cd "$here/targets/$target"
      [[ "$clean" == 1 ]] && pebble clean
      pebble build ${args[@]+"${args[@]}"}
    )
  done
}

# a face is any directory carrying config/pebble.appinfo.json: the repo root itself in a repo of
# one, or one under watchfaces/, at the top level or one deeper inside a family folder that also
# holds the code its faces share. that rule is what keeps a family's core/ from being built as a
# face, with nothing to register anywhere. a face at the root is named by its appinfo, because the
# root folder is named after wherever the repo was cloned
face_names() {
  {
    if [[ -f "$here/config/pebble.appinfo.json" ]]; then
      node -p "require(process.argv[1]).name" "$here/config/pebble.appinfo.json"
    fi
    if [[ -d "$here/watchfaces" ]]; then
      find "$here/watchfaces" -mindepth 3 -maxdepth 4 -name pebble.appinfo.json -path '*/config/*' \
        | sed 's#/config/pebble.appinfo.json$##' | xargs -r -n 1 basename
    fi
  } | sort
}

if [[ "$face" == "all" ]]; then
  while IFS= read -r name; do
    build_face "$name"
  done < <(face_names)
  exit 0
fi

if ! face_names | grep -qx "$face"; then
  echo "no such face: no config/pebble.appinfo.json at the repo root or under watchfaces/ names $face" >&2
  exit 1
fi

build_face "$face"
