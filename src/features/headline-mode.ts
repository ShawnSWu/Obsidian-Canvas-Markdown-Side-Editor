// Headline mode (issue #13): a vault-wide toggle that visually collapses
// every canvas card to just its first H1. Purely CSS-driven — this module
// only toggles the body class and publishes the user-tunable title size as
// a CSS variable; styles.css does the rest.
import type { CanvasMdSideEditorSettings } from '../settings';

const HEADLINE_BODY_CLASS = 'cmside-headline-mode';
const H1_SIZE_VAR = '--cmside-h1-size';

export function applyHeadlineMode(settings: CanvasMdSideEditorSettings): void {
  try {
    const on = !!settings.headlineMode;
    document.body.classList.toggle(HEADLINE_BODY_CLASS, on);
    const h1 = clampHeadlineSize(settings.headlineH1Size, 22, 5, 60);
    document.body.style.setProperty(H1_SIZE_VAR, String(h1));
  } catch {}
}

export function removeHeadlineMode(): void {
  try { document.body.classList.remove(HEADLINE_BODY_CLASS); } catch {}
}

// Coerce a possibly-invalid stored size into a number inside [min, max],
// falling back to `fallback` for non-finite or missing values.
export function clampHeadlineSize(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
