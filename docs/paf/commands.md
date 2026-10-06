# Commands

`paf help`, `paf --help`, `paf -h`, or `paf` on its own prints the list:

```
paf: gives each family or face its own pebble-app-framework, and builds and checks it in place

usage: paf <command> [args]

  sync [unit] [--locked] [--force]
                               fill each unit's paf/ from its pinned tag and install its node_modules
  status                       each unit's faces, tag, the newest framework 4 tag, and whether it is ready
  pin <unit> <tag|latest>
                               move a unit to another tag, showing the changelog between them first
  use <unit> local [path]      point a unit's paf/ at a local framework clone, builds included
  use <unit> pinned            put it back on its tag
  build <face|all> [--clean]   build a face in its unit (not on Windows itself), clean when message keys, dependencies, or the framework changed
  gen <face> <kind|all> [args]
                               run one generator the framework, a listed plugin, or the unit offers for a face,
                               or all it has inputs for
  check [unit]                 run every check the framework and the listed plugins ship, in every unit or one
  tool <face> <name> [args]    run a tool a listed plugin offers, such as clay-preview or tap-walk
  run <unit|face> <script> [args]
                               run any npm script in a unit
  test | typecheck [unit]      run the unit's own test script, or tsc on its own tsconfigs, in every unit or one
  lint [unit] [--fix]          lint a unit with what a listed plugin offers, or its own lint script, in every unit or one
  format [unit] [--check]      format a unit's files the same way, or with --check say which would change
  doctor                       check git, node, the pins, the unit layout, the SDK, and the workflows

A unit is a folder with a paf.config.json: a family or a face of its own under watchfaces/ or watchapps/,
or the repo root for a repo that is one face or one family. PAF_HOME moves the cache. PAF_REPO fetches the framework from
another URL or path.
```

## What Every Command Shares

**Naming a Unit.** Wherever a command takes `[unit]`, a face name works too and picks the unit that holds it. So `paf sync gridlock` syncs the whole `mosaic` family. Leaving the unit out runs every unit in the repo.

**One Unit at a Time.** `sync`, `check`, `test`, `typecheck`, `lint`, and `format` take at most one unit, and stop when given two:

```
$ paf sync a b
paf: paf sync takes one unit and was given 2: a, b. Run it once for each, or with none for every unit
```

**Flags.** `sync`, `status`, `pin`, `use`, `check`, `test`, `typecheck`, `lint`, `format`, and `doctor` refuse a flag they do not take, so a mistyped `--locked` in CI stops rather than running a sync that writes:

```
$ paf status --verbose
paf: paf status has no flag --verbose
```

`build`, `gen`, `run`, and `tool` pass every argument on to what they run.

**Readying a Unit.** `build`, `gen`, `check`, `tool`, `run`, `test`, `typecheck`, `lint`, and `format` sync the unit before they run anything, so a fresh clone or a pin a teammate moved is taken care of. They only fetch the framework when the cache lacks the pinned commit, so they work offline once a unit has synced. `sync`, `pin`, and `use <unit> pinned` always fetch. `status` and `doctor` never do.

**Node.** `build`, `gen`, `check`, `tool`, `lint`, and `format` run the framework's own scripts, and refuse a Node outside the range in `paf/package.json`.

**Exit Codes.** `0` when everything passed, `1` when anything failed. `gen` and `tool` exit with the code of the script they ran. A command that runs over every unit carries on past a failing one, then names each that failed, such as `sync failed in watchfaces/mosaic`. An error `paf` stops on is printed to stderr, starting `paf:`.

## paf sync

```
paf sync [unit] [--locked] [--force]
```

Fills each unit's `paf/` from its pinned tag and installs its `node_modules`. It fetches the framework once, then for each unit records the tag's commit if `paf.config.json` has none, refills `paf/` when the commit or the listed plugins changed, and installs when the lock, the system, or a `package.json` in `paf/` changed. A unit already in step is left alone, so a sync with nothing to do prints nothing.

A first sync in a fresh clone:

```
$ paf sync
pebble-watchface-lcars: paf/ is on v4.0.0 (4002539), 214 files
pebble-watchface-lcars: installing node_modules, which brings the lock up to date if the framework moved

added 216 packages in 2s
```

**`--locked`** is for CI. It installs with `npm ci` from the lock and never writes `paf.config.json` or the lock. It stops when a unit has no `package-lock.json`, when `paf.config.json` records no commit, or when a unit is on a local framework.

**`--force`** reinstalls a `node_modules` installed from the other system, such as from WSL when running on Windows. Without it `paf` stops rather than replace it.

Every unit is checked before the fetch, so a pin `paf` cannot fill or a unit it would refuse is reported even offline.

## paf status

```
paf status
```

Shows each unit, its faces, the tag it pins, the newest framework 4 tag, and whether it is ready to build. It changes nothing and never fetches, so `LATEST` is as of the last fetch.

```
$ paf status
UNIT                    FACES                           TAG     LATEST  STATE
watchfaces/ide-vscode   ide-vscode                      v4.0.0  v4.0.0  ready
watchfaces/mosaic       gridlock, sidereel              v4.0.0  v4.0.0  ready
watchfaces/radar-array  radar-array                     v4.0.0  v4.0.0  ready
watchfaces/sketchbook   ridgeline, shoreline, treeline  v4.0.0  v4.0.0  ready
LATEST is the newest framework 4 tag as of the last fetch, a release when there is one, and paf sync fetches again.

toolchain: SDK 4.33.1 active. v4.0.0 was built with 4.33.1
```

**`STATE`** is one of:

* `ready`: `paf/` and `node_modules` match the pin.
* `needs paf sync`: `paf/` is missing or on another commit, a listed plugin is missing, or the install is behind.
* `node_modules from linux` or `from win32`: installed from the other system. See [paf sync](#paf-sync) and `--force`.
* `local, <path>`: on a local framework clone through `paf use`.
* `problem: <message>`: the unit could not be read, with the reason.

A face shows as `?` when its appinfo cannot be read.

The `toolchain` line compares the SDK `pebble --version` reports with the SDK each framework tag was built with.

## paf pin

```
paf pin <unit> <tag|latest>
```

Moves one unit to another framework tag, fills its `paf/`, and installs. Naming a face moves the whole family it belongs to. `latest` is the newest framework 4 release, or the newest release candidate when there is no release yet.

Before it writes anything it checks that the tag is a framework 4 version tag, that the framework has it, and that it has every plugin the unit lists. Then it prints what changed between the two tags in the framework changelog: every breaking entry in full, and a count of the rest. It ends with the generators to run, since a new framework can change what they write.

Moving `mosaic` to a newer tag prints this, with the parts in angle brackets filled in:

```
$ paf pin mosaic latest
mosaic: v4.0.0 to <new tag>
Breaking
  - **Breaking:** <each breaking entry between the two tags>
<n> other changelog entries. The full list is in paf/CHANGELOG.md once the pin moves
then run paf gen <face> all for gridlock, sidereel
watchfaces/mosaic: paf/ is on <new tag> (<commit>), <n> files
watchfaces/mosaic: installing node_modules, which brings the lock up to date if the framework moved
```

Moving back to an older tag lists what is being left behind instead. A unit that pins nothing yet prints `first pin` in place of the old tag.

Pinning the tag a unit is already on syncs it, and takes the new commit if the tag moved since it was recorded:

```
$ paf pin lcars-stardate latest
pebble-watchface-lcars is already on v4.0.0
```

A unit already on a tag newer than `latest`, such as a release candidate, stays where it is with `paf pin <unit> latest`. A unit on a local framework moves off it onto the tag.

## paf use

```
paf use <unit> local [path]
paf use <unit> pinned
```

**`local`** fills a unit's `paf/` from a framework clone on disk, working tree included, so uncommitted edits reach the build. The path defaults to a `pebble-app-framework` folder beside the repo. From then on every command that readies the unit copies the clone again first, and skips the copy when nothing changed.

```
$ paf use lcars-stardate local /mnt/e/_DEV_/pebble-watchfaces/pebble-app-framework
pebble-watchface-lcars: paf/ is on 8b45d9e from /mnt/e/_DEV_/pebble-watchfaces/pebble-app-framework, working tree included, 214 files
paf sync --locked refuses until paf use pebble-watchface-lcars pinned
```

The clone has to be framework 4, with a `src/package.json` named `pebble-app-framework`. Its specs, fixtures, and the plugins the unit does not list are left out, the same as from a tag.

**`pinned`** puts the unit back on its tag. If the sync refuses, the local copy stays in place.

```
$ paf use lcars-stardate pinned
pebble-watchface-lcars: paf/ is on v4.0.0 (4002539), 214 files
```

## paf build

```
paf build <face|all> [--clean] [args]
```

Builds a face into a `.pbw` with the framework's build script. It runs on WSL, Linux, or macOS with the Pebble SDK, and refuses on Windows itself. `all` builds every face in the repo and carries on past a failing one.

`paf` keeps a record of what each face's last passing build was made from, in `targets/.paf-build.json`. The next build starts clean on its own when the face's message keys, the unit's lock, or the framework in `paf/` changed since then, or when there is no passing build to go on from, and it names the reason:

```
$ paf build lcars-stardate
== lcars-stardate: no passing build here to go on from, so this one is clean ==
Sandbox targets/lcars-stardate is ready (source face lcars-stardate 1.13.0, watchface=true).
built emit/ for lcars-stardate and copied 2 generated components into targets/lcars-stardate/emit/src/pkjs/
== building lcars-stardate (face lcars-stardate) ==
…
[177/177] Creating app_bundle:  -> build/lcars-stardate.pbw
'build' finished successfully (1.742s)
```

On a local framework, an edit to the framework only makes the build clean when it touches the `waf/` helpers, since waf tracks the rest itself.

**`--clean`** forces a clean build. Every other argument goes on to `pebble build`. The `.pbw` lands in `targets/<face>/build/`.

## paf gen

```
paf gen <face> <kind|all> [args]
```

Runs a generator for a face. The framework, each listed plugin, and the unit itself can offer generators. `paf gen <face> <kind>` runs one, whatever the face holds, with any arguments typed after it.

**`all`** runs every generator the face has inputs for, in order, and stops at the first that fails with its exit code. It takes no arguments, since each generator gets its own. Each prints a heading as it starts:

```
$ paf gen lcars-stardate all
== gen clay: lcars-stardate ==
wrote src/pkjs/clay/slot-component.g.js (50201 bytes)
== gen icons: lcars-stardate ==
…
```

A face with nothing to generate prints `<face> has nothing to generate`. An unknown kind names what the unit does offer:

```
$ paf gen lcars-stardate nope
paf: no generator called nope. What the unit lists offers clay, icons, thumbnails, and background, and no plugin the unit leaves out offers it either
```

When a plugin the unit leaves out offers it, the message names that plugin to list instead. The order `all` runs in is under [Generators](workflows.md#generators).

## paf check

```
paf check [unit]
```

Runs every check the framework and the listed plugins ship, such as whether each face's generated output is current. Every check runs to the end, so one failure never hides another.

```
$ paf check
== check: pebble-watchface-lcars ==
Clay components: every face is current
icon media: every face is current
thumbnails: every face is current
```

A stale face means its generator has to run again with `paf gen <face> all`.

## paf tool

```
paf tool <face> <name> [args]
```

Runs a tool a listed plugin offers, with the face first and every argument after the name passed on exactly as typed, `-h` and `--` included. The `dev` plugin offers `clay-preview` and `tap-walk`:

```sh
paf tool gridlock clay-preview
```

An unknown name lists the tools the unit has:

```
$ paf tool lcars-stardate nope
paf: no tool called nope. What the unit lists offers clay-preview and tap-walk, and no plugin the unit leaves out offers it either
```

## paf run

```
paf run <unit|face> <script> [args]
```

Runs one of the unit's own npm scripts, after readying the unit. Any arguments go after a `--`, and a `--` typed first is dropped, so these are the same:

```sh
paf run mosaic test:coverage --reporter=dot
paf run mosaic test:coverage -- --reporter=dot
```

It exits `0` or `1`, whatever code npm returned.

## paf test

```
paf test [unit]
```

Runs the unit's own `test` script, in every unit or one:

```
$ paf test
== test: pebble-watchface-lcars ==

> test
> vitest run --config config/vitest.config.ts
…
```

## paf typecheck

```
paf typecheck [unit]
```

Runs `tsc --noEmit` on every `tsconfig.json` and `tsconfig.*.json` the unit holds, with the TypeScript the unit installed. It skips `paf/` and its swap folders, `targets/`, `node_modules/`, `vendor/`, `coverage/`, and dot folders other than `.github/`.

```
$ paf typecheck
== typecheck: pebble-watchface-lcars config/tsconfig.builder.json ==
== typecheck: pebble-watchface-lcars config/tsconfig.json ==
== typecheck: pebble-watchface-lcars config/tsconfig.spec.json ==
== typecheck: pebble-watchface-lcars config/tsconfig.tools.json ==
== typecheck: pebble-watchface-lcars tsconfig.json ==
```

A unit with no tsconfig fails rather than passing with nothing checked.

## paf lint

```
paf lint [unit] [--fix]
```

Lints a unit with the listed plugin that offers it, normally the framework's `code-style`. A unit listing none runs its own `lint` script. One with neither fails, and names the plugin to list when the framework has one that offers it.

```
$ paf lint
== lint: pebble-watchface-lcars ==
linted with paf/plugins/code-style/eslint.config.ts
```

**`--fix`** fixes what it can.

## paf format

```
paf format [unit] [--check]
```

Formats a unit the same way. `code-style` runs Prettier over its CSS, JSON, and YAML once the unit sets `"code-style": { "prettier": true }` under `plugins`.

**`--check`** writes nothing and lists the files that would change.

```
$ paf format --check
== format: pebble-watchface-lcars ==
all 22 files are formatted
```

## paf doctor

```
paf doctor
```

Checks the whole setup without changing anything:

* `git` on the PATH, and Node against each unit's framework range
* `paf/`, its swap folders, and `targets/` are gitignored in every unit
* no `lib/` left from `paf` 1.0.0, no appinfo left in `config/`, and the workspaces set
* every listed plugin is in `paf/`, and no swap folder is left over
* every unit is on its pin, the same as `paf status`
* the active SDK against the SDK each tag was built with
* the repo's workflows load the framework's actions at the newest pinned tag or later

```
$ paf doctor
ok       git version 2.43.0
ok       node 24.18.0
ok       every unit on a tag matches its pin
ok       pebble-tool 5.0.40
ok       SDK 4.33.1 is what v4.0.0 was built with (ide-vscode, mosaic, radar-array, sketchbook)
```

Each line starts with `ok`, `problem`, `behind`, `note`, or `skipped`. An SDK older than a tag was built with is `behind`, and a newer one is only a `note`. Without `pebble`, as on Windows outside WSL, the SDK line is `skipped`. It exits `1` when there is any `problem` or `behind`.
