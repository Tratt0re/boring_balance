const repoOwner = 'Tratt0re';
const repoName = 'boring_balance';
const repoUrl = `https://github.com/${repoOwner}/${repoName}`;
const releaseUrl = `${repoUrl}/releases/latest`;
const siteUrl = 'https://boringbalance.com/';

export const APP_CONFIG = {
  brandName: 'Boring Balance',
  siteName: 'Boring Balance',
  authorName: 'Boring Balance',
  homePath: './',

  repoOwner,
  repoName,
  repoUrl,
  siteUrl,
  releaseUrl,

  releasesApiUrl: `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,

  socialImageUrl: `${siteUrl}android-chrome-512x512.png`,
  socialImageAlt: 'Boring Balance logo and app icon',

  seo: {
    title: 'Boring Balance | Desktop Personal Finance and Expense Tracking App',
    description:
      'Boring Balance is a calm desktop personal finance app for tracking balances, expenses, budgets, and accounts locally on Windows, macOS, and Linux.',
    keywords:
      'personal finance desktop app, expense tracking desktop app, balance tracking app, simple budgeting software, privacy-friendly finance tracker, desktop money tracking app',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
    canonicalUrl: siteUrl,
    locale: 'en_US',
    themeColorLight: '#f5f3ed',
    themeColorDark: '#2a2722',
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
