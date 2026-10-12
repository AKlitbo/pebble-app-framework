/**
 * Checks that every face's appinfo media block and committed icon PNGs match what the icons generator
 * would write from icons.json.
 *
 * An icon added to icons.json without a `paf gen <face> icons` run leaves the C side with no RESOURCE_ID for it,
 * and the face fails to build. A size changed without one leaves the old PNG, which draws at the old
 * size. A face that declares icons but has no media array to write them into is reported as well,
 * rather than being skipped.
 *
 * It reads the media helpers from media.ts rather than the rasterizer, so it compares JSON and PNG
 * headers without loading sharp.
 *
 * paf check runs this from the unit when it lists the icons plugin.
 */
import fs from 'node:fs';
import path from 'node:path';
import { appinfoPath, faceDir, listFaceNames } from '../../tools/shared/faces.ts';
import { checkFace, runCheck } from '../../tools/shared/checks.ts';
import { buildMedia, iconPngPath, iconSizeProblems, iconsManifestPath, mediaOf, readPngHeader, replaceMediaArray } from './media.ts';
import type { IconManifest } from './media.ts';
import type { MediaEntry } from '../../tools/manifest/build-manifests.ts';
import { readText } from '../../tools/shared/files.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/**
 * Every face whose media block is stale or missing, or whose icon PNGs are missing or the wrong size.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkIcons(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of listFaceNames()) {
    await checkFace(face, problems, () => {
      const manifestFile = iconsManifestPath(face);

      if (!fs.existsSync(manifestFile)) {
        return;
      }

      const raw = readText(appinfoPath(face));
      const media = mediaOf(raw);

      if (!Array.isArray(media)) {
        problems.push(`${face}: declares icons in resources/icons.json, but its appinfo has no media array to hold them`);
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as IconManifest;

      // a stale block and the PNGs it would miss have the one fix, so the PNGs wait for the next run
      if (replaceMediaArray(raw, buildMedia(media as MediaEntry[], manifest)) !== raw) {
        problems.push(`${face}: the appinfo media block is stale, run paf gen ${face} icons`);
        return;
      }

      const readPng = (name: string): Buffer | null => readPngHeader(path.join(faceDir(face), iconPngPath(name)));

      for (const problem of iconSizeProblems(manifest, readPng)) {
        problems.push(`${face}: ${problem}, run paf gen ${face} icons`);
      }
    });
  }

  return problems;
}

if (isMainScript(import.meta)) {
  runCheck('icons', checkIcons);
}
