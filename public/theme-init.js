// Applies the saved theme before the app renders, to avoid a flash of the wrong theme. It lives in a
// file, not inline in index.html, because the Content-Security-Policy does not allow inline scripts.
(function () {
  const html = document.documentElement;

  try {
    const theme = localStorage.theme;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

    const isSystem = theme === 'system' || !('theme' in localStorage);
    const isDark = theme === 'dark' || (isSystem && prefersDark);
    html.classList.toggle('dark', isDark);
    html.setAttribute('data-theme', theme ?? 'system');
  } catch (_) {}
})();
