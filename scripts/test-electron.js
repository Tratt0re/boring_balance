const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const electronPath = require('electron');
const vitestPath = path.join(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
const forwardedArgs = process.argv.slice(2);
const vitestArgs = forwardedArgs.length > 0 ? forwardedArgs : ['run'];

const result = spawnSync(
  electronPath,
  [vitestPath, ...vitestArgs, '--config', 'vitest.electron.config.mjs'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'inherit',
  },
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error('[test:electron] Failed to execute vitest under Electron:', result.error);
}

process.exit(1);
