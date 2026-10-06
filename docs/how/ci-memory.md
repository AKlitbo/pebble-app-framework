# Memory Reports

Every CI run of a face repo ends with one table of every face's size, set against the limits that stop a Pebble app building and ranked so the face closest to one sits at the top. `report-memory` measures each face in its own build job, and `render-memory` gathers every face's figures in one job after the builds and puts the table on the run's summary. A face that grows toward a limit shows it there, and on the run page as a warning, long before the SDK refuses to build it. Neither action ever fails a build for size.

The actions are [`report-memory`](../../.github/actions/report-memory/action.yml), which reads the figures in [`lib.js`](../../.github/actions/report-memory/scripts/lib.js) and writes them in [`report-memory.js`](../../.github/actions/report-memory/scripts/report-memory.js), and [`render-memory`](../../.github/actions/render-memory/action.yml), which ranks them in [`lib.js`](../../.github/actions/render-memory/scripts/lib.js) and writes the table in [`render-memory.js`](../../.github/actions/render-memory/scripts/render-memory.js). The build job they sit in is on [Building in CI](ci-builds.md).

## In the Workflow

`report-memory` runs in each face's build job, straight after the build. `render-memory` runs in a job of its own that waits for every build:

```yaml
jobs:
  pebble:
    # the matrix, the sync, and setup-pebble, as on Building in CI
    steps:
      - name: Build Watchface
        shell: bash
        run: paf build ${{ matrix.face }} | tee build-${{ matrix.face }}.log

      - name: Report Memory
        if: always()
        uses: AKlitbo/pebble-app-framework/.github/actions/report-memory@v4.0.0
        with:
          face: ${{ matrix.face }}
          log: build-${{ matrix.face }}.log

  memory:
    runs-on: ubuntu-latest
    needs: pebble
    if: always()
    steps:
      - uses: actions/checkout@v7

      - name: Render Memory
        uses: AKlitbo/pebble-app-framework/.github/actions/render-memory@v4.0.0
```

The split follows from the matrix. Each face builds in a job of its own, and a job's summary belongs to that job alone, but the question worth answering is which face is closest to the edge, and that needs every face in one place. So each build job uploads its figures as an artifact, and one later job collects them.

**Both Run after a Failure.** `if: always()` on the step lets `report-memory` run after a build that failed. A build that linked some targets before it failed still reports those, and one that never linked has no figures, so its step fails with a message saying so and the face is missing from the table. `if: always()` on the memory job lets `render-memory` run when some build jobs failed, so the faces that did build still get their table.

## What report-memory Reads

**The Build Log.** The SDK prints a block like this for each platform while it links:

```
EMERY APP MEMORY USAGE
Total size of resources:        52974 bytes / 256.0KB
Total footprint in RAM:         27635 bytes / 128.0KB
Free RAM available (heap):      103437 bytes
```

It prints it only while linking, so the log of a build that linked is the only place the free heap figure exists, which is why the build step pipes its output through `tee`. A build with nothing to relink prints no block, and CI's first build of a face is always clean, so it always links.

**Which Target a Block Belongs To.** The block names its platform but not its target. The target only shows on the `Waf: Leaving directory` line that closes each sandbox's build, as `.../targets/<target>/build`. A target built for two platforms prints both blocks before that one line, so the action holds each block until the line arrives and then files them all under that target. A block missing any of its figures is dropped with a warning naming the target and the platform, rather than leaving a hole in the table without a word. A block that no sandbox line ever closes is left out.

**The Binaries.** For each target and platform, the action opens the build's `pebble-app.bin` under `targets/<target>/build/<platform>/` in the face's unit. The app image is the file's size, which is the load size plus the relocation table. The static size is the `virtual_size` field in the app's header, which the SDK fills with `.text` plus `.data` plus `.bss`. A missing binary reads as 0 with a warning, and its row is kept, so the gap shows in the table rather than the row quietly going.

**What Stops It.** The step fails when no `log` was passed, when there is no file at that path, when the log holds no memory report at all, or when it holds one and none of the figures can be read. The last message says the SDK may have changed how it prints them, since the figures are only ever read from the SDK's own wording.

**What It Writes.** One row per target and platform, with the face, the target, the platform, the app image, the static size, and the resources, footprint, and free heap from the log. The rows go into a JSON file, uploaded as the artifact `memory-<face>`. A re-run of a job that already uploaded its rows replaces them, since a second upload under the same name is otherwise refused.

## The Limits

`render-memory` ranks each row against the app image and static size limits of the current public Pebble SDK:

| Size | Limit |
| :-- | :-- |
| App Image | 64 KB, 65536 bytes |
| Static | 65535 bytes |

**The App Image.** The SDK's `inject_metadata.py` hard codes `MAX_APP_BINARY_SIZE` as `0x10000` and ignores the platform config, so emery and gabbro get 64 KB too, even though they declare 128 KB.

**The Static Size.** The cap is 65535 because `virtual_size` is a 16-bit field in the app header, and a larger size cannot be written into it. A face carries little relocation table, so this is normally the tighter of the two.

**The Heap Is Shown, Not Ranked.** The free heap is what is left of the 128 KB after the app, the system's own allocations, and the resources. The table shows it, and the resources, but neither plays any part in the ranking or the warnings, since no face is near the heap.

**Reports Only.** Neither action fails a build for size, since the SDK already fails a build at the limit that counts. A face at 95% still builds and still ships, and the table is there to show how much room is left before a change, not to stop one.

## The Table

`render-memory` downloads every `memory-*` artifact the run uploaded, works out each row's percentage of both limits, and writes the table to the run's summary under the heading **Watchface Memory**. It writes nothing to a pull request itself. The summary sits on the run's page, which a pull request's checks lead to.

**Ranked by the Tighter Limit.** Each row's rank is the larger of its two percentages, and rows are sorted from the highest down, so the target and platform closest to either limit come first whichever limit it is. A face with several targets or platforms has a row for each, and they can land apart in the table.

**Marks and Warnings.** A row at 80% or more of a limit gets a warning mark, and one at 90% or more an alarm mark. The mark goes on whichever column is closer to its limit, so it points at the size to cut. Every row at 80% or more also raises a GitHub warning naming the target, the platform, the percentage, and the limit, as in `<target> on emery is at 82% of its static size limit.`, so it shows on the run page and in a pull request's checks, not only in the summary.

**Rows Not Measured.** A row whose binary was missing reads an app image of 0, which no real app has, and one whose binary was too short to hold a header reads a static size of 0. Ranked as they are, either would sit at the bottom as the safest face when it may be the closest to a limit. So both are marked **not measured** in the size columns and listed first, above every measured row.

**No Rows at All.** When every build job failed before it reported, there is nothing to rank. `render-memory` puts a short note on the summary and raises a warning, and passes. The build jobs already failed and carry the reason, and failing here too would add a red job that points away from it.
