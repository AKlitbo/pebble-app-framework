/**
 * Checks that every face's committed theme-previews.g.js matches its manifest and pictures.
 *
 * A re-shot screenshot or an edited manifest without a `paf gen <face> theme-previews` run ships a
 * picker showing old pictures. A path that is missing or is not a PNG means the manifest and the
 * files on disk disagree. A face that commits the asset but has no manifest is reported too.
 *
 * paf check runs this from the unit when it lists the thumbnails plugin.
 */
import fs from 'node:fs';
import { checkFace, runCheck } from '../../tools/shared/checks.ts';
import { encodePreviews, manifestFile, outFile } from './embed-theme-previews.ts';
import { readText } from '../../tools/shared/files.ts';
import { listFaceNames } from '../../tools/shared/faces.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/**
 * Every face whose theme-preview asset is stale or disagrees with its manifest.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkThemePreviews(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of listFaceNames()) {
    await checkFace(face, problems, () => {
      const hasManifest = fs.existsSync(manifestFile(face));
      const committed = fs.existsSync(outFile(face));

      if (!hasManifest) {
        if (committed) {
          problems.push(`${face}: commits theme-previews.g.js, but has no resources/theme-previews.json to build it from`);
        }

        return;
      }

      const built = encodePreviews(face);
      const current = committed ? readText(outFile(face)) : null;

      if (current !== built.source) {
        problems.push(`${face}: theme-previews.g.js is stale, run paf gen ${face} theme-previews`);
      }

      for (const problem of built.problems) {
        problems.push(`${face}: ${problem}`);
      }
    });
  }

  return problems;
}

if (isMainScript(import.meta)) {
  runCheck('theme previews', checkThemePreviews);
}
