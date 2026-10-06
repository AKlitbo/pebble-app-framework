# Building in CI

A face repo's build workflow turns every push and pull request into a built `.pbw` for each face, made with the framework, plugins, packages, SDK, and pebble-tool the face's unit committed to. It runs the CLI's sync action to fill the unit's `paf/` from its pinned tag, the framework's `setup-pebble` action to install the SDK and pebble-tool that framework records, and then `paf build`, once per face in a matrix. The workflow names no version of anything but the actions' own tags, so moving a unit to a new framework is a change to its `paf.config.json` and lock, and the next run builds with whatever that framework records.

The sync action is the CLI's [`action.yml`](https://github.com/AKlitbo/pebble-app-framework-cli/blob/v2.0.0/.github/actions/sync/action.yml), and what it runs is [`sync.ts`](https://github.com/AKlitbo/pebble-app-framework-cli/blob/v2.0.0/src/commands/sync.ts). `setup-pebble` is the framework's [`action.yml`](../../.github/actions/setup-pebble/action.yml), with its scripts beside it in [`toolchain.js`](../../.github/actions/setup-pebble/scripts/toolchain.js) and [`verify-pebble.js`](../../.github/actions/setup-pebble/scripts/verify-pebble.js). [Workflows](../paf/workflows.md#ci) has the short version for setting a repo up. The memory steps in the same job are on [Memory Reports](ci-memory.md).

## The Build Job

This is a face repo's build job, with its matrix cut down to three faces and its memory step left out:

```yaml
jobs:
  pebble:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        include:
          - { face: radar-array, unit: watchfaces/radar-array }
          - { face: gridlock, unit: watchfaces/mosaic }
          - { face: ridgeline, unit: watchfaces/sketchbook }
    steps:
      - uses: actions/checkout@v7

      - uses: AKlitbo/pebble-app-framework-cli/.github/actions/sync@v2.0.0
        with:
          face: ${{ matrix.face }}

      - uses: AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v4.0.0
        with:
          face: ${{ matrix.face }}

      - name: Build Watchface
        shell: bash
        run: paf build ${{ matrix.face }} | tee build-${{ matrix.face }}.log

      - uses: actions/upload-artifact@v7
        with:
          name: pbw-${{ matrix.face }}
          path: |
            ${{ matrix.unit }}/targets/${{ matrix.face }}*/build/*.pbw
          if-no-files-found: error
```

The steps run in this order because each reads what the one before it left. The sync fills the unit's `paf/` and `node_modules`. `setup-pebble` reads the toolchain out of that `paf/`. `paf build` needs both, and the upload needs the build's output.

**One Job per Face.** `fail-fast: false` keeps a face that breaks from cancelling the rest, so every other face still builds and uploads its `.pbw`. Each face is a matrix entry of its own, even when several share a unit, such as Gridlock and Sidereel in Mosaic. Faces sharing a unit each fill it again in their own job, and in return a failure shows on the job named for the face that broke.

**The Unit Column.** The build writes into the `targets/` folder of the unit the face builds from, so the upload path needs the unit's folder. Nothing else reads it. A repo that is one face or one family builds into `targets/` at its root and can leave the column out.

**Every Target the Face Builds.** The `face*` in the path picks up each target's sandbox, so a face that builds a watchface and a watchapp from one source, such as Gridlock's `gridlock-face` and `gridlock-app`, uploads both. `if-no-files-found: error` fails the job when the build left nothing to upload.

**Piped through `tee`.** The log is kept for `report-memory`, as [What report-memory Reads](ci-memory.md#what-report-memory-reads) covers. `shell: bash` runs the step with `pipefail`, so a build that fails still fails the step rather than passing on `tee`'s exit code.

The other jobs in the same workflow, such as `paf test`, `paf lint`, `paf typecheck`, and `paf check`, run the sync action with no `face`. That fills every unit in the repo, and each command then runs across all of them.

## Filling the Unit

The sync action sets up Node, installs `paf`, and runs `paf sync --locked`, passing the face when the workflow gave one.

**paf Comes from the Action's Tag.** The runner checks out the CLI repo at the tag the workflow names to run the action, and the action installs `paf` from that checkout with `npm ci` and a global install. Nothing is fetched from npm for it, so the `@v2.0.0` on the `uses:` line is the `paf` version the job runs.

**Node.** `node-version` defaults to 24. The install and any `paf` command in the same job run under it, so it has to fall inside the framework's `engines.node`, which on framework 4 is 22.18 or later on Node 22, or 24.2 or later. A `paf` command that runs the framework's tools refuses a Node outside that range before it starts. In a build job, `setup-pebble` then installs the Node major the framework records, and the build runs under that one, so keeping `node-version` at the same major keeps the install and the build on one Node.

**What the Sync Does.** It fetches the framework into a bare clone, checks the pinned tag still points at the commit `paf.config.json` recorded, copies the tag's files and the listed plugins into `paf/`, and installs `node_modules`. A tag that moved since it was pinned stops the sync with or without `--locked`, since a framework changing under a face that nobody re-pinned is what a pin exists to stop. The clone lives in `paf`'s cache on the runner, and nothing carries it between runs, so every job fetches it fresh.

**Given a Face.** The sync fills only the unit that face builds from, so a build job for one face leaves every other unit in the repo alone. With no face it fills every unit, tries each one even after one fails, and reports every problem before the job stops.

### Why `--locked` Matters

A plain `paf sync` is made for a developer's clone. It runs `npm install`, which brings the lock up to date when the framework moved, and it writes the tag's commit into `paf.config.json` when none is recorded yet. In CI either write would build from files nobody committed, and the job would pass on them. `--locked` writes neither file, and [paf sync](../paf/commands.md#paf-sync) covers what it refuses.

A lock or pin out of step therefore fails the job, and the fix is made in a clone and committed. The commands that run after the sync, `paf build` among them, ready the unit again without `--locked`, but they find the install and `paf/` already matching the lock and the pin, so they install and write nothing.

## Installing the Toolchain

`setup-pebble` puts Node, pebble-tool, and the Pebble SDK on the runner, checks that they answer, and records which versions the build used.

**The Versions Come from the Framework.** Given a `face`, it finds the unit the face builds from and reads [`toolchain.json`](../../src/toolchain.json) out of the unit's `paf/`. The file records the SDK, the pebble-tool, and the Node major the framework was tested with, so a face builds on the same toolchain whichever action tag loads it, and moving the face's pin is what moves its toolchain. The step stops when the file is missing, when its format is one this action cannot read, or when it names no SDK or no pebble-tool. It also stops when the unit has no `node_modules`, since a build without them would fail far from the cause, and the message says to run `paf sync` first.

**The Inputs Give Way.** With a `face`, the recorded versions win over the action's `sdk-version`, `pebble-tool-version`, and `node-version` inputs. A run that passes a different SDK or pebble-tool gets a warning naming both, so a job meant to try another version says why it did not. Without a `face`, the inputs decide and the SDK defaults to whatever is newest on the day. The action then runs `npm ci` at the repo root itself. A face repo always passes the face.

**The Install.** The action installs the SDK's system libraries with `apt-get`, then installs pebble-tool through `uv` at the recorded version, then runs `pebble sdk install` for the recorded SDK. The action runs on Linux runners only, and the `apt-get` step needs one built on Debian or Ubuntu, such as `ubuntu-latest`.

**The Cache.** pebble-tool and the SDK come to about 1.6 GB once installed, so a pinned SDK is fetched once and restored after that. The cache key holds the SDK, the pebble-tool, the runner's architecture, its image and image version, and its Python version. `uv` runs pebble-tool on the runner's own Python, so a new runner image has to miss the cache, or the restored pebble would point at a Python that is no longer there. `uv`'s own downloaded Python is cached too, for the runners where it fetched one. The cache is saved straight after the install rather than at the end of the job, since GitHub keeps an end-of-job cache only when the job passes, and a face that fails to build would download the SDK again on every run. An SDK left at `latest` is never cached, since a cached latest would stop being the latest.

**The Check.** The last step runs `pebble --version` and `pebble sdk list` and puts a table on the job summary with the pebble-tool version, the active SDK, the installed SDKs, and the SDK asked for. When pebble-tool prints that a newer SDK or pebble-tool is out, that goes on the summary and the run as a notice, never a failure, since a pinned build stays put. The step fails when `pebble` cannot run, when no SDK is active, or when the active SDK is not the pinned one, so a toolchain problem stops here rather than as a confusing build error further on.

The release workflow runs the same action with the same face, so a release is built on the toolchain CI built and tested it with. [Releases](ci-releases.md) covers the rest of that workflow.

## The Build

`paf build <face>` builds each of the face's targets in a sandbox of its own, as [paf build](../paf/commands.md#paf-build) covers. The first sandbox to fail stops the build with pebble's own exit code, which fails the step.

A fresh checkout has no record of a passing build, so in CI the first build of each face is always clean. That is what makes the memory report work, since an incremental build with nothing to relink prints no memory figures.

## Loading the Actions at a Tag

A workflow loads the framework's actions from `AKlitbo/pebble-app-framework` at a tag. A unit's `paf/` holds only what the framework ships from its `src/`, which leaves out `.github/`, so there is no copy of the actions inside the face repo to load.

The tag on the `uses:` line decides the actions' own code, and the face's `paf/` decides everything they read about the face. `setup-pebble` reads the toolchain from the face's framework, and the release actions find the face and its targets with the tools in that same `paf/`. An action tag newer than a unit's pin therefore still builds the face the way its own framework does. An action tag older than the newest pin may not read what that framework writes, such as a `toolchain.json` format it does not know, and `paf doctor` flags any workflow that loads the framework's actions at a tag older than the newest one a unit pins.
