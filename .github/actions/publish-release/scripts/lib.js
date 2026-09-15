/**
 * Names the release assets.
 *
 * build.sh leaves one <target>.pbw per target with no version in the name, which is fine for a build and
 * useless on a release page where several versions sit side by side.
 */

/**
 * Names a release asset so it says what it installs on.
 *
 * A pbw built for one watch carries that watch's name. One built for several carries every platform's binary,
 * and naming it after any one of them would mislead, so it is named by the version alone.
 *
 * @param target The build target, such as gridlock-face.
 * @param platforms The platforms the target builds for, from its manifest.
 * @param version The version being released.
 * @return The asset's file name.
 */
function assetName(target, platforms, version) {
  if (platforms.length === 1) {
    return `${target}-${platforms[0]}-${version}.pbw`;
  }
  return `${target}-${version}.pbw`;
}

module.exports = { assetName };
