const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const ngCliPath = path.join(projectRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const forwardedArgs = process.argv.slice(2);

const result = spawnSync(
  process.execPath,
  [ngCliPath, 'build', '--configuration', 'production', '--base-href', './', ...forwardedArgs],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      CI: process.env.CI ?? '1',
    },
    stdio: 'inherit',
  },
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error('[build:web] Failed to execute Angular build:', result.error);
}

process.exit(1);
