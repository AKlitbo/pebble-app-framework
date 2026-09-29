/**
 * Checks that every face's appinfo media block matches what the icons generator would write from icons.json.
 *
 * An icon added to icons.json without a `paf gen <face> icons` run leaves the C side with no RESOURCE_ID for it,
 * and the face fails to build. A face that declares icons but has no media array to write them into
 * is reported as well, rather than being skipped.
 *
 * It reads the media helpers from media.ts rather than the rasterizer, so it compares JSON without
 * loading sharp.
 *
 * paf check runs this from the unit when it lists the icons plugin.
 */
import fs from 'node:fs';
import { appinfoPath } from '../../tools/faces.ts';
import { checkFace, facesToCheck, runCheck } from '../../tools/checks.ts';
import { buildMedia, iconsManifestPath, mediaOf, replaceMediaArray } from './media.ts';
import type { IconManifest } from './media.ts';
import type { MediaEntry } from '../../tools/manifest/build-manifests.ts';
import { readText } from '../../tools/files.ts';

/**
 * Every face whose media block is stale or missing.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkIcons(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of facesToCheck()) {
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
      if (replaceMediaArray(raw, buildMedia(media as MediaEntry[], manifest)) !== raw) {
        problems.push(`${face}: the appinfo media block is stale, run paf gen ${face} icons`);
      }
    });
  }

  return problems;
}

if (import.meta.main) {
  runCheck('icon media', checkIcons);
}
