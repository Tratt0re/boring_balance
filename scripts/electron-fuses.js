// electron-builder afterPack hook: flips Electron fuses in the packaged binary so that it refuses to
// behave as a generic Node runtime, and only loads the app from its packed asar.
//
// - RunAsNode: stops ELECTRON_RUN_AS_NODE from turning the app into a plain Node interpreter.
// - EnableNodeCliInspectArguments: stops --inspect and friends from opening a debugger port.
// - EnableNodeOptionsEnvironmentVariable: stops NODE_OPTIONS from injecting code at startup.
// - OnlyLoadAppFromAsar: the main process loads only app.asar, never a loose folder beside it.
// - GrantFileProtocolExtraPrivileges: the renderer loads over file://, so this stays off.

const path = require('node:path');
const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses');

const FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
};

/** electron-builder calls this after the app folder is assembled and before it is archived. */
async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const productName = packager.appInfo.productFilename;

  const binaryPath = {
    darwin: path.join(appOutDir, `${productName}.app`, 'Contents', 'MacOS', productName),
    win32: path.join(appOutDir, `${productName}.exe`),
    linux: path.join(appOutDir, productName),
  }[electronPlatformName];

  if (!binaryPath) {
    throw new Error(`electron-fuses: unsupported platform ${electronPlatformName}.`);
  }

  await flipFuses(binaryPath, FUSES);
  console.log(`[electron-fuses] Fuses set on ${binaryPath}`);
}

module.exports = afterPack;
module.exports.FUSES = FUSES;
