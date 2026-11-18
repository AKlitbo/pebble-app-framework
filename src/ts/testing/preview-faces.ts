/**
 * A folder of faces for the theme-preview specs, standing in for the framework's face lookup.
 *
 * A spec hands this module to vi.mock in place of tools/shared/faces.ts, so faceDir and listFaceNames
 * reach a temp folder and the generator never reads or writes the repo's own faces. The spec and the
 * mock share this one module, so the folder a spec opens is the one the generator sees.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from './temp-dir.ts';

/** The folder the faces sit in for the spec that is running. */
let workspace = '';

/**
 * Opens a fresh folder of faces for the spec that is running, removed when it finishes.
 *
 * @param prefix The start of the folder's name, which says which spec left it if one ever stays.
 * @return The folder.
 */
export function openFaceWorkspace(prefix: string): string {
  workspace = tempDir(prefix);
  return workspace;
}

/**
 * A face's folder inside the open workspace, as tools/shared/faces.ts gives it.
 *
 * @param face The face.
 * @return Its folder.
 */
export function faceDir(face: string): string {
  return path.join(workspace, face);
}

/**
 * Every face in the open workspace, as tools/shared/faces.ts lists them.
 *
 * @return Each face folder's name.
 */
export function listFaceNames(): string[] {
  return fs.readdirSync(workspace);
}

/**
 * The bytes of a test picture: the PNG signature, which is all the generator checks, and one byte that
 * tells the pictures apart.
 *
 * @param index The byte that tells this picture from the others.
 * @return The picture's bytes.
 */
export function pictureBytes(index: number): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, index]);
}

/**
 * The data URL the generator writes for a picture made by pictureBytes.
 *
 * @param index The byte the picture was made with.
 * @return The data URL.
 */
export function pictureUrl(index: number): string {
  return 'data:image/png;base64,' + pictureBytes(index).toString('base64');
}

/**
 * Writes a face with a theme-previews manifest and a picture at each path, each made with its index
 * in the list. A path may sit in a folder of its own, which is made for it.
 *
 * @param face The face.
 * @param manifest What resources/theme-previews.json holds.
 * @param pictures The picture paths, relative to the face folder.
 */
export function writeFace(face: string, manifest: unknown, pictures: string[]): void {
  const dir = faceDir(face);

  fs.mkdirSync(path.join(dir, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'resources', 'theme-previews.json'), JSON.stringify(manifest));

  pictures.forEach((picture, index) => {
    fs.mkdirSync(path.dirname(path.join(dir, picture)), { recursive: true });
    fs.writeFileSync(path.join(dir, picture), pictureBytes(index));
  });
}
