export const APP_CONFIG = {
  repoOwner: 'Tratt0re',
  repoName: 'boring_balance',
  repoUrl: 'https://github.com/Tratt0re/boring_balance',

  releasesApiUrl:
    'https://api.github.com/repos/Tratt0re/boring_balance/releases/latest',

  fallback: {
    windows: 'https://github.com/Tratt0re/boring_balance/releases/latest',
    macos: 'https://github.com/Tratt0re/boring_balance/releases/latest',
    linux: 'https://github.com/Tratt0re/boring_balance/releases/latest',
  },

  assetPatterns: {
    windows: [/\.exe$/i, /\.msi$/i, /setup/i],
    macos: [/\.dmg$/i, /\.pkg$/i, /darwin/i, /macos/i],
    linux: [/\.AppImage$/i, /\.deb$/i, /\.tar\.gz$/i, /linux/i],
  },

  windowsPreferPortable: false,
} as const;
