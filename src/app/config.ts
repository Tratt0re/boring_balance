const repoOwner = 'Tratt0re';
const repoName = 'boring_balance';
const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
const releaseUrl = `${repoUrl}/releases/latest`;
const siteUrl = 'https://boringbalance.com/';
const authorGithubUrl = `https://github.com/${repoOwner}`;
const authorLinkedInUrl = 'https://www.linkedin.com/in/salvatdeluca/';

export const APP_CONFIG = {
  brandName: 'Boring Balance',
  siteName: 'Boring Balance',
  authorName: 'Tratt0re',
  authorGithubUrl,
  authorLinkedInUrl,
  homePath: './',

  repoOwner,
  repoName,
  repoUrl,
  siteUrl,
  releaseUrl,

  releasesApiUrl: `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,

  logoUrl: `${siteUrl}android-chrome-512x512.png`,
  socialImageUrl: `${siteUrl}social-card.png`,
  socialImageWidth: 1200,
  socialImageHeight: 630,
  socialImageAlt:
    'Boring Balance Overview screen showing net worth, account allocation and monthly income and expenses, next to the headline "Simple, private, boring."',

  seo: {
    title: 'Boring Balance: free, private finance tracker for desktop',
    description:
      'Free, open-source desktop app to track accounts, spending and budgets. No account, no cloud; your data stays in one file on your computer.',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    canonicalUrl: siteUrl,
    locale: 'en_US',
    themeColorLight: '#ffffff',
    themeColorDark: '#0a0a0a',
  },

  fallback: {
    windows: releaseUrl,
    macos: releaseUrl,
    linux: releaseUrl,
  },

  assetPatterns: {
    windows: [/\.exe$/i, /\.msi$/i, /setup/i],
    macos: [/\.dmg$/i, /\.pkg$/i, /darwin/i, /macos/i],
    linux: [/\.AppImage$/i, /\.deb$/i, /\.tar\.gz$/i, /linux/i],
  },

  windowsPreferPortable: false,
} as const;
