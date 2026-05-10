/**
 * Inline SVG icons. Returned as raw strings so we can drop them into
 * `innerHTML` of shadow-DOM elements without pulling in a runtime icon lib.
 * All icons are 16×16 with `currentColor` strokes / fills.
 */

export const ICON_CHAT = /* svg */ `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
</svg>`.trim();

export const ICON_CLOSE = /* svg */ `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="18" y1="6"  x2="6"  y2="18"/>
  <line x1="6"  y1="6"  x2="18" y2="18"/>
</svg>`.trim();

export const ICON_MINIMIZE = /* svg */ `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <line x1="5" y1="12" x2="19" y2="12"/>
</svg>`.trim();

export const ICON_SEND = /* svg */ `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M22 2 11 13"/>
  <path d="M22 2 15 22l-4-9-9-4 20-7z"/>
</svg>`.trim();

export const ICON_SPARKLE = /* svg */ `
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M12 2l1.8 5.6L19.5 9l-5.7 1.8L12 16.4l-1.8-5.6L4.5 9l5.7-1.4L12 2zm7 12l1 2.5 2.5 1-2.5 1L19 21l-1-2.5-2.5-1 2.5-1L19 14z"/>
</svg>`.trim();
