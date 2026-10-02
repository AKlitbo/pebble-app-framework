/**
 * Checks that every face's committed module-thumbnails.g.js matches its panel PNGs.
 *
 * A new module or a re-shot PNG without a `paf gen <face> thumbnails` run ships a settings page showing old
 * previews. A PNG naming no module, or a module with no PNG, means the previews and the catalogue
 * disagree. A face that commits the asset but has no thumbnails folder is reported too.
 *
 * paf check runs this from the unit when it lists the thumbnails plugin.
 */
import fs from 'node:fs';
import { checkFace, runCheck } from '../../tools/shared/checks.ts';
import { encodeThumbnails, outFile, thumbsDir } from './embed-thumbnails.ts';
import { readText } from '../../tools/shared/files.ts';
import { listFaceNames } from '../../tools/shared/faces.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/**
 * Every face whose thumbnail asset is stale or disagrees with its module list.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkThumbnails(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of listFaceNames()) {
    await checkFace(face, problems, () => {
      const hasFolder = fs.existsSync(thumbsDir(face));
      const committed = fs.existsSync(outFile(face));

      if (!hasFolder) {
        if (committed) {
          problems.push(`${face}: commits module-thumbnails.g.js, but has no resources/thumbnails folder to build it from`);
        }

        return;
      }

      const built = encodeThumbnails(face);
      const current = committed ? readText(outFile(face)) : null;

      if (current !== built.source) {
        problems.push(`${face}: module-thumbnails.g.js is stale, run paf gen ${face} thumbnails`);
      }

      for (const png of built.stray) {
        problems.push(`${face}: resources/thumbnails/${png} names no module`);
      }

      for (const slug of built.missing) {
        problems.push(`${face}: the ${slug} module has no thumbnail`);
      }
    });
  }

  return problems;
}

if (isMainScript(import.meta)) {
  runCheck('thumbnails', checkThumbnails);
}
