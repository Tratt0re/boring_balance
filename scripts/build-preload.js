const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');

const rootDir = path.join(__dirname, '..');
const entryPoint = path.join(rootDir, 'electron', 'preload.js');
const outFile = path.join(rootDir, 'electron', 'preload.bundle.cjs');
const isWatchMode = process.argv.includes('--watch');
const isProdMode = process.argv.includes('--prod') || process.argv.includes('--production');
const outMapFile = `${outFile}.map`;

const buildOptions = {
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: !isProdMode,
  logLevel: 'info',
};

async function runBuild() {
  if (isWatchMode) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log('[preload] Watching for changes...');
    return;
  }

  await esbuild.build(buildOptions);

  if (!buildOptions.sourcemap && fs.existsSync(outMapFile)) {
    fs.unlinkSync(outMapFile);
  }

  console.log('[preload] Build complete ->', outFile);
}

runBuild().catch((error) => {
  console.error('[preload] Build failed:', error);
  process.exitCode = 1;
});
