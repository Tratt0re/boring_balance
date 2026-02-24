const SMALL_SCREEN_BREAKPOINT_PX = 1300;

function isSmallScreenViewportWidth(width: number): boolean {
  return width < SMALL_SCREEN_BREAKPOINT_PX;
}

function detectSmallScreenViewport(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return isSmallScreenViewportWidth(window.innerWidth);
}

export { SMALL_SCREEN_BREAKPOINT_PX, isSmallScreenViewportWidth, detectSmallScreenViewport };
